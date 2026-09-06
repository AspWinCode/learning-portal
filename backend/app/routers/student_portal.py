"""Личный кабинет ученика: свой логин, витрина курсов, выдача доступа админом/тренером."""
import hashlib
import hmac
import re
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, selectinload

from app import auth
from app.database import get_db
from app.models import (
    AppSetting,
    CourseCatalogItem,
    CourseCatalogItemKind,
    CustomLesson,
    CustomLessonStudent,
    Grade,
    Group,
    GroupStatus,
    GroupStudent,
    LessonCancellation,
    Module,
    Student,
    StudentCourseAccess,
    StudentCourseAccessStatus,
    StudentCourseProgress,
    StudentCredential,
    Topic,
    User,
)
from app.schemas.student_portal import (
    CourseCatalogItemCreate,
    CourseCatalogItemOut,
    CourseCatalogItemUpdate,
    CourseLaunchResponse,
    CourseProgressOut,
    GrantCourseAccessRequest,
    ProgressSyncRequest,
    StudentCourseAccessOut,
    StudentCredentialCreate,
    StudentCredentialOut,
    ChangePasswordRequest,
    StudentAbonementOut,
    StudentCredentialUpdate,
    StudentPortalSettings,
    StudentGradeOut,
    StudentLoginRequest,
    StudentLoginResponse,
    StudentCourseProgressOut,
    StudentPortalAdminView,
    StudentProfileOut,
    UpcomingLessonOut,
)
from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET, build_launch_redirect_url

import logging as _logging

_logger = _logging.getLogger(__name__)


async def _sync_pixelforge_enrollment(item: "CourseCatalogItem", student_id: int, *, enroll: bool) -> None:
    """Курсы PixelForge — пункты витрины code=pixelforge-<course_id>. При выдаче/
    отзыве доступа синхронизируем зачисление ученика на курс в PixelForge.
    Best-effort: сбой не ломает выдачу доступа в портале."""
    if not item.code or not item.code.startswith("pixelforge-"):
        return
    try:
        course_id = int(item.code.rsplit("-", 1)[1])
    except (ValueError, IndexError):
        return
    from app.services import pixelforge_client as _pf

    ref = f"lp-student-{student_id}"
    try:
        if enroll:
            await _pf.enroll_student(course_id, ref)
        else:
            await _pf.unenroll_student(course_id, ref)
    except Exception as e:  # noqa: BLE001
        _logger.warning("PixelForge enroll sync failed (course=%s ref=%s enroll=%s): %s", course_id, ref, enroll, e)


def _verify_kodex_signature(raw_body: bytes, signature_header: str) -> bool:
    secret = SSO_KODEX_SHARED_SECRET.encode("utf-8")
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)

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


_PORTAL_SETTINGS_KEY = "student_portal.settings"


def _load_portal_settings(db: Session) -> StudentPortalSettings:
    row = db.query(AppSetting).filter(AppSetting.key == _PORTAL_SETTINGS_KEY).first()
    if not row or not row.value:
        return StudentPortalSettings()
    import json as _json
    try:
        return StudentPortalSettings.model_validate(_json.loads(row.value))
    except Exception:
        return StudentPortalSettings()


# ─── Настройки кабинета (admin) ───────────────────────────────────────────────

@router.get("/admin/portal-settings", response_model=StudentPortalSettings)
async def get_portal_settings(
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    return _load_portal_settings(db)


@router.put("/admin/portal-settings", response_model=StudentPortalSettings)
async def update_portal_settings(
    payload: StudentPortalSettings,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    import json as _json
    row = db.query(AppSetting).filter(AppSetting.key == _PORTAL_SETTINGS_KEY).first()
    if not row:
        row = AppSetting(key=_PORTAL_SETTINGS_KEY, value=_json.dumps(payload.model_dump()))
        db.add(row)
    else:
        row.value = _json.dumps(payload.model_dump())
    db.commit()
    return payload


# ─── Абонемент студента ───────────────────────────────────────────────────────

@router.get("/abonement", response_model=StudentAbonementOut)
async def get_student_abonement(
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    settings = _load_portal_settings(db)
    if not settings.show_abonement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Недоступно")
    if not current_student.abonement_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Абонемент не назначен")
    return StudentAbonementOut(
        name=current_student.abonement.name,
        training_start_date=current_student.training_start_date,
    )


# ─── Смена пароля ────────────────────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_student_password(
    payload: ChangePasswordRequest,
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    credential = db.query(StudentCredential).filter(
        StudentCredential.student_id == current_student.id,
        StudentCredential.is_active.is_(True),
    ).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Учётная запись не найдена")
    if not auth.verify_password(payload.current_password, credential.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный текущий пароль")
    credential.password_hash = auth.get_password_hash(payload.new_password)
    db.commit()


# ─── Расписание (ближайшие уроки) ────────────────────────────────────────────

@router.get("/schedule", response_model=List[UpcomingLessonOut])
async def get_student_schedule(
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    today = date.today()
    end_date = today + timedelta(days=14)

    # Активные группы студента
    group_links = (
        db.query(GroupStudent)
        .filter(
            GroupStudent.student_id == current_student.id,
            GroupStudent.left_at.is_(None),
        )
        .all()
    )
    group_ids = [gl.group_id for gl in group_links]

    lessons: list[UpcomingLessonOut] = []

    if group_ids:
        groups = (
            db.query(Group)
            .options(selectinload(Group.group_schedules), selectinload(Group.trainer))
            .filter(Group.id.in_(group_ids), Group.status == GroupStatus.ACTIVE)
            .all()
        )

        # Отмены в диапазоне
        cancellations = db.query(LessonCancellation).filter(
            LessonCancellation.group_id.in_(group_ids),
            LessonCancellation.lesson_date >= today,
            LessonCancellation.lesson_date <= end_date,
        ).all()
        cancelled_set = {
            (c.group_id, c.lesson_date, c.start_time, c.end_time)
            for c in cancellations
        }

        for group in groups:
            trainer_name = group.trainer.full_name if group.trainer else "Тренер"
            for schedule in group.group_schedules:
                current = today
                while current <= end_date:
                    if current.weekday() == schedule.day_of_week:
                        if group.start_date and current < group.start_date:
                            current += timedelta(days=1)
                            continue
                        if (group.id, current, schedule.start_time, schedule.end_time) not in cancelled_set:
                            lessons.append(UpcomingLessonOut(
                                lesson_date=current,
                                start_time=schedule.start_time,
                                end_time=schedule.end_time,
                                group_name=group.name,
                                trainer_name=trainer_name,
                                kind="regular",
                                online_url=group.online_url,
                            ))
                    current += timedelta(days=1)

    # Кастомные уроки (отработки / доп. занятия)
    custom_links = (
        db.query(CustomLessonStudent)
        .filter(CustomLessonStudent.student_id == current_student.id)
        .all()
    )
    if custom_links:
        custom_ids = [cl.lesson_id for cl in custom_links]
        custom_lessons = (
            db.query(CustomLesson)
            .options(selectinload(CustomLesson.trainer))
            .filter(
                CustomLesson.id.in_(custom_ids),
                CustomLesson.lesson_date >= today,
                CustomLesson.lesson_date <= end_date,
            )
            .all()
        )
        for cl in custom_lessons:
            trainer_name = cl.trainer.full_name if cl.trainer else "Тренер"
            lessons.append(UpcomingLessonOut(
                lesson_date=cl.lesson_date,
                start_time=cl.start_time,
                end_time=cl.end_time,
                group_name=None,
                trainer_name=trainer_name,
                kind="custom",
                online_url=cl.online_url,
            ))

    lessons.sort(key=lambda x: (x.lesson_date, x.start_time))
    return lessons


# ─── Оценки студента ─────────────────────────────────────────────────────────

@router.get("/grades", response_model=List[StudentGradeOut])
async def get_student_grades(
    current_student: Student = Depends(auth.get_current_student),
    db: Session = Depends(get_db),
):
    grades = (
        db.query(Grade)
        .join(Topic, Grade.topic_id == Topic.id)
        .join(Module, Topic.module_id == Module.id)
        .join(User, Grade.trainer_id == User.id)
        .filter(Grade.student_id == current_student.id)
        .order_by(Grade.date.desc())
        .limit(50)
        .all()
    )
    result = []
    for g in grades:
        result.append(StudentGradeOut(
            id=g.id,
            date=g.date,
            grade=g.grade,
            topic_name=g.topic.name,
            module_name=g.topic.module.name,
            comment=g.comment,
            trainer_name=g.trainer.full_name if g.trainer else "Тренер",
        ))
    return result


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
    progress_map = {
        p.catalog_item_id: p
        for p in db.query(StudentCourseProgress)
        .filter(
            StudentCourseProgress.student_id == current_student.id,
            StudentCourseProgress.catalog_item_id.in_(item_ids),
        )
        .all()
    }
    return [
        CourseCatalogItemOut(
            id=item.id,
            code=item.code,
            name=item.name,
            description=item.description,
            cover_image_url=item.cover_image_url,
            kind=item.kind,
            has_access=True,
            progress=CourseProgressOut.model_validate(progress_map[item.id]) if item.id in progress_map else None,
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


# ─── Синхронизация прогресса из Кодэкс ──────────────────────────────────────

_EXTERNAL_REF_RE = re.compile(r"^lp-student-(\d+)$")


@router.post("/progress-sync")
async def progress_sync(request: Request, db: Session = Depends(get_db)):
    """Принимает прогресс ученика от сервера Кодэкс.
    Авторизация — HMAC-подпись тела заголовком X-Kodex-Signature."""
    raw_body = await request.body()
    signature = request.headers.get("X-Kodex-Signature", "")
    if not _verify_kodex_signature(raw_body, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись запроса")

    payload = ProgressSyncRequest.model_validate_json(raw_body)

    m = _EXTERNAL_REF_RE.match(payload.external_ref)
    if not m:
        raise HTTPException(status_code=404, detail="ученик не найден")
    student_id = int(m.group(1))
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="ученик не найден")

    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.code == payload.catalog_item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="курс не найден")

    progress = (
        db.query(StudentCourseProgress)
        .filter(
            StudentCourseProgress.student_id == student_id,
            StudentCourseProgress.catalog_item_id == item.id,
        )
        .first()
    )
    if not progress:
        progress = StudentCourseProgress(student_id=student_id, catalog_item_id=item.id)
        db.add(progress)

    progress.cases_solved = payload.cases_solved
    progress.cases_total = payload.cases_total
    progress.rank_name = payload.rank_name
    progress.badges_count = payload.badges_count
    progress.last_badge_name = payload.last_badge_name
    db.commit()
    return {"ok": True}


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


# ─── Админ: карточка кабинета конкретного ученика ────────────────────────────

@router.get("/admin/students/{student_id}", response_model=StudentPortalAdminView)
async def admin_get_student_portal_view(
    student_id: int,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    credential = db.query(StudentCredential).filter(StudentCredential.student_id == student_id).first()
    grants = db.query(StudentCourseAccess).filter(StudentCourseAccess.student_id == student_id).all()
    progress_rows = (
        db.query(StudentCourseProgress, CourseCatalogItem)
        .join(CourseCatalogItem, CourseCatalogItem.id == StudentCourseProgress.catalog_item_id)
        .filter(StudentCourseProgress.student_id == student_id)
        .all()
    )
    return StudentPortalAdminView(
        credential=StudentCredentialOut.model_validate(credential) if credential else None,
        access_grants=[StudentCourseAccessOut.model_validate(g) for g in grants],
        course_progress=[
            StudentCourseProgressOut(
                course_code=ci.code,
                course_name=ci.name,
                cases_solved=p.cases_solved,
                cases_total=p.cases_total,
                rank_name=p.rank_name,
                badges_count=p.badges_count,
                last_badge_name=p.last_badge_name,
                updated_at=p.updated_at,
            )
            for p, ci in progress_rows
        ],
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


@router.patch("/admin/credentials/{credential_id}", response_model=StudentCredentialOut)
async def admin_update_student_credential(
    credential_id: int,
    payload: StudentCredentialUpdate,
    current_user: User = Depends(auth.require_permission("student_portal.manage")),
    db: Session = Depends(get_db),
):
    credential = db.query(StudentCredential).filter(StudentCredential.id == credential_id).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Логин не найден")

    if payload.login is not None and payload.login != credential.login:
        login_taken = (
            db.query(StudentCredential)
            .filter(StudentCredential.login == payload.login, StudentCredential.id != credential_id)
            .first()
        )
        if login_taken:
            raise HTTPException(status_code=400, detail="Логин уже занят")
        credential.login = payload.login

    if payload.password:
        credential.password_hash = auth.get_password_hash(payload.password)

    if payload.is_active is not None:
        credential.is_active = payload.is_active

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
        await _sync_pixelforge_enrollment(item, student.id, enroll=True)
        return StudentCourseAccessOut.model_validate(existing)

    grant = StudentCourseAccess(
        student_id=student.id,
        catalog_item_id=item.id,
        granted_by_user_id=current_user.id,
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    await _sync_pixelforge_enrollment(item, student.id, enroll=True)
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

    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.id == grant.catalog_item_id).first()
    if item:
        await _sync_pixelforge_enrollment(item, grant.student_id, enroll=False)
    return {"ok": True}
