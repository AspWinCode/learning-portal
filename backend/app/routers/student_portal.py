"""Личный кабинет ученика: свой логин, витрина курсов, выдача доступа админом/тренером."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    CourseCatalogItem,
    CourseCatalogItemKind,
    Student,
    StudentCourseAccess,
    StudentCourseAccessStatus,
    StudentCredential,
    User,
)
from app.schemas.student_portal import (
    CourseCatalogItemCreate,
    CourseCatalogItemOut,
    CourseCatalogItemUpdate,
    CourseLaunchResponse,
    GrantCourseAccessRequest,
    StudentCourseAccessOut,
    StudentCredentialCreate,
    StudentCredentialOut,
    StudentLoginRequest,
    StudentLoginResponse,
    StudentProfileOut,
)
from app.services.kodex_sso import build_launch_redirect_url

router = APIRouter()


# ─── Вход ученика ────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=StudentLoginResponse)
async def student_login(payload: StudentLoginRequest, db: Session = Depends(get_db)):
    credential = db.query(StudentCredential).filter(StudentCredential.login == payload.login).first()
    if not credential or not credential.is_active or not auth.verify_password(payload.password, credential.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    student = db.query(Student).filter(Student.id == credential.student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

    from datetime import datetime, timezone
    credential.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = auth.create_student_access_token(student.id, credential.login)
    return StudentLoginResponse(access_token=token, student=StudentProfileOut.model_validate(student))


@router.get("/me", response_model=StudentProfileOut)
async def get_student_me(current_student: Student = Depends(auth.get_current_student)):
    return StudentProfileOut.model_validate(current_student)


# ─── Витрина курсов (для ученика) ────────────────────────────────────────────

@router.get("/courses", response_model=List[CourseCatalogItemOut])
async def list_my_courses(
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    grants = (
        db.query(StudentCourseAccess)
        .filter(
            StudentCourseAccess.student_id == current_student.id,
            StudentCourseAccess.status == StudentCourseAccessStatus.ACTIVE,
        )
        .all()
    )
    item_ids = [g.catalog_item_id for g in grants]
    if not item_ids:
        return []
    items = (
        db.query(CourseCatalogItem)
        .filter(CourseCatalogItem.id.in_(item_ids), CourseCatalogItem.is_active.is_(True))
        .order_by(CourseCatalogItem.sort_order)
        .all()
    )
    return [
        CourseCatalogItemOut(
            id=item.id,
            code=item.code,
            name=item.name,
            description=item.description,
            cover_image_url=item.cover_image_url,
            kind=item.kind,
            has_access=True,
        )
        for item in items
    ]


@router.post("/courses/{item_id}/launch", response_model=CourseLaunchResponse)
async def launch_course(
    item_id: int,
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    grant = (
        db.query(StudentCourseAccess)
        .filter(
            StudentCourseAccess.student_id == current_student.id,
            StudentCourseAccess.catalog_item_id == item_id,
            StudentCourseAccess.status == StudentCourseAccessStatus.ACTIVE,
        )
        .first()
    )
    if not grant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому курсу")

    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.id == item_id, CourseCatalogItem.is_active.is_(True)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Курс не найден")

    if item.kind != CourseCatalogItemKind.EXTERNAL:
        raise HTTPException(status_code=400, detail="Этот курс не поддерживает внешний запуск")

    redirect_url = build_launch_redirect_url(current_student, item)
    if not redirect_url:
        raise HTTPException(status_code=503, detail="Курс временно недоступен (не настроен переход)")

    return CourseLaunchResponse(redirect_url=redirect_url)


# ─── Админ: витрина курсов (CRUD) ────────────────────────────────────────────

@router.get("/admin/catalog", response_model=List[CourseCatalogItemOut])
async def admin_list_catalog(
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    items = db.query(CourseCatalogItem).order_by(CourseCatalogItem.sort_order).all()
    return [
        CourseCatalogItemOut(
            id=i.id, code=i.code, name=i.name, description=i.description,
            cover_image_url=i.cover_image_url, kind=i.kind, has_access=False,
        )
        for i in items
    ]


@router.post("/admin/catalog", response_model=CourseCatalogItemOut)
async def admin_create_catalog_item(
    payload: CourseCatalogItemCreate,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    existing = db.query(CourseCatalogItem).filter(CourseCatalogItem.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Курс с таким кодом уже существует")
    item = CourseCatalogItem(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        cover_image_url=payload.cover_image_url,
        kind=CourseCatalogItemKind(payload.kind.value),
        external_url=payload.external_url,
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return CourseCatalogItemOut(
        id=item.id, code=item.code, name=item.name, description=item.description,
        cover_image_url=item.cover_image_url, kind=item.kind, has_access=False,
    )


@router.patch("/admin/catalog/{item_id}", response_model=CourseCatalogItemOut)
async def admin_update_catalog_item(
    item_id: int,
    payload: CourseCatalogItemUpdate,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Курс не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return CourseCatalogItemOut(
        id=item.id, code=item.code, name=item.name, description=item.description,
        cover_image_url=item.cover_image_url, kind=item.kind, has_access=False,
    )


# ─── Админ: логин ученика ─────────────────────────────────────────────────────

@router.post("/admin/credentials", response_model=StudentCredentialOut)
async def admin_create_student_credential(
    payload: StudentCredentialCreate,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    existing = db.query(StudentCredential).filter(StudentCredential.student_id == student.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="У ученика уже есть логин в кабинет")
    login_taken = db.query(StudentCredential).filter(StudentCredential.login == payload.login).first()
    if login_taken:
        raise HTTPException(status_code=400, detail="Логин уже занят")

    credential = StudentCredential(
        student_id=student.id,
        login=payload.login,
        password_hash=auth.get_password_hash(payload.password),
    )
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return StudentCredentialOut.model_validate(credential)


# ─── Админ: выдача доступа к курсу ────────────────────────────────────────────

@router.post("/admin/access", response_model=StudentCourseAccessOut)
async def admin_grant_course_access(
    payload: GrantCourseAccessRequest,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.id == payload.catalog_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Курс не найден")

    existing = (
        db.query(StudentCourseAccess)
        .filter(
            StudentCourseAccess.student_id == student.id,
            StudentCourseAccess.catalog_item_id == item.id,
        )
        .first()
    )
    if existing:
        existing.status = StudentCourseAccessStatus.ACTIVE
        existing.granted_by_user_id = current_user.id
        existing.revoked_at = None
        db.commit()
        db.refresh(existing)
        return StudentCourseAccessOut.model_validate(existing)

    grant = StudentCourseAccess(
        student_id=student.id,
        catalog_item_id=item.id,
        granted_by_user_id=current_user.id,
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return StudentCourseAccessOut.model_validate(grant)


@router.delete("/admin/access/{access_id}")
async def admin_revoke_course_access(
    access_id: int,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    from datetime import datetime, timezone

    grant = db.query(StudentCourseAccess).filter(StudentCourseAccess.id == access_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Доступ не найден")
    grant.status = StudentCourseAccessStatus.REVOKED
    grant.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
