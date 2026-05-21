from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.database import get_db
from app import auth
from app.schemas import (
    CharacteristicCreate, CharacteristicResponse, CharacteristicUpdate,
    CharacteristicApprove, CharacteristicReject, CharacteristicTemplateCreate,
    CharacteristicTemplateResponse
)
from app.models import (
    Characteristic, CharacteristicTemplate, User, CharacteristicStatus, Student, GroupStudent, Group, UserRole, StudentStatus
)
from app.routers.action_log import log_action
from datetime import datetime
from app.services.telegram import notify_admins, notify_user
from app.services.characteristic_review import (
    submit_characteristic_for_review,
    approve_characteristic as approve_characteristic_svc,
    reject_characteristic as reject_characteristic_svc,
)
from app.services.communication_hub import CommunicationService
from app.services.parent_dashboard import send_characteristic_published_web_push
from app.services.student_activity import log_student_activity

router = APIRouter()


def _characteristics_effective_role(current_user: User) -> UserRole:
    return auth.resolve_effective_role(current_user)


@router.post("/templates", response_model=CharacteristicTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template: CharacteristicTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("characteristics.manage"))
):
    """Создание шаблона характеристики (только администратор)"""
    db_template = CharacteristicTemplate(
        name=template.name,
        fields=[field.dict() for field in template.fields],
        is_active=True
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    
    return db_template


@router.get("/templates", response_model=List[CharacteristicTemplateResponse])
async def read_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка шаблонов характеристик"""
    templates = db.query(CharacteristicTemplate).filter(
        CharacteristicTemplate.is_active == True
    ).all()
    return templates


@router.post("/", response_model=CharacteristicResponse, status_code=status.HTTP_201_CREATED)
async def create_characteristic(
    characteristic: CharacteristicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Создание характеристики (тренер)"""
    auth.ensure_permission(current_user, "characteristics.manage")
    if _characteristics_effective_role(current_user) != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create characteristics")
    
    # Проверка доступа к ученику
    has_access = db.query(GroupStudent).join(Group).filter(
        GroupStudent.student_id == characteristic.student_id,
        GroupStudent.left_at.is_(None),
        Group.trainer_id == current_user.id,
    ).first()
    
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this student")
    
    # Проверка уникальности (не должно быть опубликованной или ожидающей согласования)
    existing = db.query(Characteristic).filter(
        Characteristic.student_id == characteristic.student_id,
        Characteristic.month == characteristic.month,
        Characteristic.year == characteristic.year,
        Characteristic.status.in_([CharacteristicStatus.PENDING, CharacteristicStatus.APPROVED])
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Characteristic for this month/year already exists in pending or approved status"
        )
    
    # Валидация обязательных полей по активному шаблону (если есть)
    active_template = db.query(CharacteristicTemplate).filter(
        CharacteristicTemplate.is_active == True
    ).first()
    if active_template and isinstance(active_template.fields, list):
        for f in active_template.fields:
            if f.get("required"):
                key = f.get("name")
                if not key:
                    continue
                value = (characteristic.data or {}).get(key)
                if value is None or (isinstance(value, str) and value.strip() == ""):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Обязательное поле «{key}» не заполнено"
                    )
    
    db_characteristic = Characteristic(
        student_id=characteristic.student_id,
        trainer_id=current_user.id,
        month=characteristic.month,
        year=characteristic.year,
        data=characteristic.data,
        status=CharacteristicStatus.DRAFT
    )
    db.add(db_characteristic)
    db.commit()
    db.refresh(db_characteristic)
    
    log_action(db, current_user.id, "create", "characteristic", db_characteristic.id)
    return db_characteristic


@router.post("/{characteristic_id}/submit")
async def submit_characteristic(
    characteristic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Отправка характеристики на согласование"""
    auth.ensure_permission(current_user, "characteristics.manage")
    if _characteristics_effective_role(current_user) != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can submit characteristics")
    try:
        db_characteristic = submit_characteristic_for_review(db, characteristic_id, current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    log_action(db, current_user.id, "submit", "characteristic", characteristic_id)
    try:
        await notify_admins(
            db,
            f"Характеристика на согласовании\n"
            f"Ученик: {db_characteristic.student.full_name if db_characteristic.student else db_characteristic.student_id}\n"
            f"Период: {db_characteristic.month}/{db_characteristic.year}\n"
            f"Тренер: {current_user.full_name}"
        )
        if db_characteristic.student:
            CommunicationService.send(
                db,
                channel="email",
                recipient_type="student",
                recipient_id=db_characteristic.student.id,
                event_key="characteristic_approved",
                created_by=current_user.id,
                context={
                    "student_name": db_characteristic.student.full_name,
                    "period": f"{db_characteristic.month}/{db_characteristic.year}",
                },
            )
            send_characteristic_published_web_push(
                db,
                user_id=db_characteristic.student.parent_id,
                student_name=db_characteristic.student.full_name,
                period=f"{db_characteristic.month}/{db_characteristic.year}",
            )
    except Exception:
        pass
    return {"message": "Characteristic submitted for approval"}


@router.put("/{characteristic_id}", response_model=CharacteristicResponse)
async def update_characteristic(
    characteristic_id: int,
    body: CharacteristicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Редактирование характеристики (тренер) — разрешено для draft/rejected"""
    auth.ensure_permission(current_user, "characteristics.manage")
    if _characteristics_effective_role(current_user) != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can update characteristics")

    db_characteristic = db.query(Characteristic).filter(
        Characteristic.id == characteristic_id,
        Characteristic.trainer_id == current_user.id
    ).first()
    if not db_characteristic:
        raise HTTPException(status_code=404, detail="Characteristic not found")

    if db_characteristic.status not in [CharacteristicStatus.DRAFT, CharacteristicStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="Only draft or returned characteristics can be edited")

    if body.status is not None:
        # статус меняется через submit/approve/reject
        raise HTTPException(status_code=400, detail="Status cannot be changed via update")

    if body.data is not None:
        # Валидация обязательных полей по активному шаблону
        active_template = db.query(CharacteristicTemplate).filter(
            CharacteristicTemplate.is_active == True
        ).first()
        if active_template and isinstance(active_template.fields, list):
            for f in active_template.fields:
                if f.get("required"):
                    key = f.get("name")
                    if not key:
                        continue
                    value = (body.data or {}).get(key)
                    if value is None or (isinstance(value, str) and value.strip() == ""):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Обязательное поле «{key}» не заполнено"
                        )
        db_characteristic.data = body.data

    db.commit()
    db.refresh(db_characteristic)
    log_action(db, current_user.id, "update", "characteristic", characteristic_id)
    return db_characteristic


@router.post("/{characteristic_id}/approve")
async def approve_characteristic(
    characteristic_id: int,
    approval: CharacteristicApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("characteristics.manage"))
):
    """Опубликовать характеристику (администратор)"""
    try:
        db_characteristic = approve_characteristic_svc(db, characteristic_id, approval.comment)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    log_student_activity(
        db,
        student_id=db_characteristic.student_id,
        activity_type="characteristic_published",
        title="Опубликована характеристика",
        description=f"Период: {db_characteristic.month}/{db_characteristic.year}",
        created_by=current_user.id,
        payload_json={"characteristic_id": db_characteristic.id, "month": db_characteristic.month, "year": db_characteristic.year},
    )
    log_action(db, current_user.id, "approve", "characteristic", characteristic_id)
    try:
        if db_characteristic.trainer_id:
            await notify_user(
                db,
                db_characteristic.trainer_id,
                f"Характеристика опубликована\n"
                f"Ученик: {db_characteristic.student.full_name if db_characteristic.student else db_characteristic.student_id}\n"
                f"Период: {db_characteristic.month}/{db_characteristic.year}\n"
                f"Комментарий: {approval.comment or '—'}"
            )
        if db_characteristic.student and db_characteristic.student.parent_id:
            await notify_user(
                db,
                db_characteristic.student.parent_id,
                f"Опубликована характеристика\n"
                f"Ученик: {db_characteristic.student.full_name}\n"
                f"Период: {db_characteristic.month}/{db_characteristic.year}"
            )
    except Exception:
        pass
    return {"message": "Characteristic approved and published"}


@router.post("/{characteristic_id}/reject")
async def reject_characteristic(
    characteristic_id: int,
    rejection: CharacteristicReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("characteristics.manage"))
):
    """Вернуть характеристику на доработку (администратор)"""
    try:
        db_characteristic = reject_characteristic_svc(db, characteristic_id, rejection.comment)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    log_action(db, current_user.id, "reject", "characteristic", characteristic_id)
    try:
        if db_characteristic.trainer_id:
            await notify_user(
                db,
                db_characteristic.trainer_id,
                f"Характеристика возвращена на доработку\n"
                f"Ученик: {db_characteristic.student.full_name if db_characteristic.student else db_characteristic.student_id}\n"
                f"Период: {db_characteristic.month}/{db_characteristic.year}\n"
                f"Комментарий: {rejection.comment}"
            )
    except Exception:
        pass
    return {"message": "Characteristic rejected"}


@router.get("/", response_model=List[CharacteristicResponse])
async def read_characteristics(
    student_id: int = None,
    status_filter: CharacteristicStatus = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка характеристик"""
    query = db.query(Characteristic)
    
    # Родитель видит только опубликованные характеристики своих активных учеников
    auth.ensure_permission(current_user, "characteristics.access")
    effective_role = _characteristics_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        student_ids = db.query(Student.id).filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        ).subquery()
        query = query.filter(
            Characteristic.student_id.in_(student_ids),
            Characteristic.status == CharacteristicStatus.APPROVED
        )
    
    # Тренер видит только свои характеристики
    elif effective_role == UserRole.TRAINER:
        query = query.filter(Characteristic.trainer_id == current_user.id)
    
    if student_id:
        query = query.filter(Characteristic.student_id == student_id)
    if status_filter:
        query = query.filter(Characteristic.status == status_filter)
    
    characteristics = query.order_by(Characteristic.year.desc(), Characteristic.month.desc()).offset(skip).limit(limit).all()
    return characteristics


@router.get("/{characteristic_id}", response_model=CharacteristicResponse)
async def read_characteristic(
    characteristic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение характеристики по ID"""
    characteristic = db.query(Characteristic).filter(Characteristic.id == characteristic_id).first()
    if not characteristic:
        raise HTTPException(status_code=404, detail="Characteristic not found")
    
    # Проверка прав доступа
    auth.ensure_permission(current_user, "characteristics.access")
    effective_role = _characteristics_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if characteristic.student.parent_id != current_user.id or characteristic.student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        if characteristic.status != CharacteristicStatus.APPROVED:
            raise HTTPException(status_code=403, detail="Characteristic not published")
    elif effective_role == UserRole.TRAINER:
        if characteristic.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return characteristic


@router.get("/student/{student_id}/comparison")
async def get_characteristics_comparison(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение характеристик для сравнения (текущая, предыдущая, позапрошлая)"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Проверка прав доступа
    auth.ensure_permission(current_user, "characteristics.access")
    effective_role = _characteristics_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        if student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Получаем опубликованные характеристики в порядке публикации
    characteristics = db.query(Characteristic).filter(
        Characteristic.student_id == student_id,
        Characteristic.status == CharacteristicStatus.APPROVED
    ).order_by(Characteristic.published_at.desc()).limit(3).all()
    
    result = {
        "current": characteristics[0] if len(characteristics) > 0 else None,
        "previous": characteristics[1] if len(characteristics) > 1 else None,
        "before_previous": characteristics[2] if len(characteristics) > 2 else None
    }
    
    return result


@router.get("/student/{student_id}/published", response_model=List[CharacteristicResponse])
async def get_published_characteristics(
    student_id: int,
    limit: Optional[int] = Query(None, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Список опубликованных характеристик ученика (для родительской аналитики/инфографики)"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # RBAC
    auth.ensure_permission(current_user, "characteristics.access")
    effective_role = _characteristics_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        if student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    q = db.query(Characteristic).filter(
        Characteristic.student_id == student_id,
        Characteristic.status == CharacteristicStatus.APPROVED
    ).order_by(Characteristic.published_at.asc())

    if limit:
        q = q.limit(limit)

    return q.all()

