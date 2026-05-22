from datetime import date, time as dt_time, datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import auth
from app.schemas import (
    GroupCreate,
    GroupListResponse,
    GroupResponse,
    GroupUpdate,
    StudentResponse,
    GroupScheduleResponse,
    LessonSlotExtraPolicyPayload,
    LessonSlotExtraPolicyResponse,
)
from app.models import Group, User, GroupStatus, UserRole, GroupStudent, Student, StudentStatus, GroupSchedule, LessonSlotExtraPolicy
from app.routers.action_log import log_action
from app.services.student_activity import log_student_activity
from app.student_display import get_students_display_names

router = APIRouter()


def _parse_time(v) -> dt_time:
    if hasattr(v, "hour"):
        return v
    s = str(v).strip()
    parts = s.split(":")
    h = int(parts[0]) if len(parts) > 0 else 0
    m = int(parts[1]) if len(parts) > 1 else 0
    return dt_time(hour=h, minute=m, second=0)


def _group_to_response(db: Session, g: Group) -> GroupResponse:
    # Текущий состав: только связи без left_at (ученик ещё в группе)
    if hasattr(g, "group_students") and g.group_students is not None:
        student_list = [gs.student for gs in g.group_students if gs.student is not None and getattr(gs, "left_at", None) is None]
    else:
        student_list = getattr(g, "students", None) or []
    display_names = get_students_display_names(db, [s.id for s in student_list]) if student_list else {}
    students_out = [
        StudentResponse(**{**StudentResponse.model_validate(s).model_dump(), "full_name": display_names.get(s.id, s.full_name)})
        for s in student_list
    ]
    schedules = list(getattr(g, "group_schedules", None) or [])
    base = GroupResponse.model_validate(g).model_dump(exclude={"students", "schedules", "programs"})
    base["students"] = students_out
    base["schedules"] = [GroupScheduleResponse.model_validate(s) for s in schedules]
    base["programs"] = getattr(g, "programs", None) or []
    if "units_per_session" not in base or base.get("units_per_session") is None:
        base["units_per_session"] = getattr(g, "units_per_session", 1) or 1
    if "extra_rate_per_unit" not in base:
        base["extra_rate_per_unit"] = getattr(g, "extra_rate_per_unit", None)
    base["start_date"] = getattr(g, "start_date", None)
    base["lesson_format"] = getattr(g, "lesson_format", None) or "group"
    return GroupResponse(**base)


def _build_groups_query(db: Session, current_user: User):
    effective_role = auth.resolve_effective_role(current_user)
    query = db.query(Group)

    if effective_role == UserRole.TRAINER:
        query = query.filter(Group.trainer_id == current_user.id)
    elif effective_role == UserRole.PARENT:
        query = (
            query.join(GroupStudent)
            .join(Student)
            .filter(
                GroupStudent.left_at.is_(None),
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                Group.status == GroupStatus.ACTIVE,
            )
            .distinct()
        )

    return query, effective_role


def _serialize_groups(db: Session, groups: List[Group], effective_role: UserRole, current_user: User) -> List[GroupResponse]:
    for g in groups:
        g.students = [gs.student for gs in (getattr(g, "group_students", None) or []) if gs.student is not None and getattr(gs, "left_at", None) is None]

    if effective_role == UserRole.PARENT:
        for g in groups:
            try:
                g.students = [s for s in (g.students or []) if s.parent_id == current_user.id and s.status == StudentStatus.ACTIVE]
            except Exception:
                g.students = []

    all_student_ids = [s.id for g in groups for s in (g.students or [])]
    display_names = get_students_display_names(db, all_student_ids)
    result = []
    for g in groups:
        students_out = [
            StudentResponse(**{**StudentResponse.model_validate(s).model_dump(), "full_name": display_names.get(s.id, s.full_name)})
            for s in (g.students or [])
        ]
        base = GroupResponse.model_validate(g).model_dump(exclude={"students", "schedules", "programs"})
        base["students"] = students_out
        base["schedules"] = [GroupScheduleResponse.model_validate(s) for s in (getattr(g, "group_schedules", None) or [])]
        base["programs"] = getattr(g, "programs", None) or []
        result.append(GroupResponse(**base))
    return result


@router.post("/", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage"))
):
    """Создание группы (только администратор)"""
    trainer = db.query(User).filter(
        User.id == group.trainer_id,
        User.role == UserRole.TRAINER
    ).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Trainer not found")

    db_group = Group(
        name=group.name,
        direction=group.direction,
        trainer_id=group.trainer_id,
        status=GroupStatus.ACTIVE,
        start_date=group.start_date,
        lesson_format=(group.lesson_format or "group").strip().lower() or "group",
        units_per_session=group.units_per_session if group.units_per_session is not None else 1,
        extra_rate_per_unit=group.extra_rate_per_unit,
    )
    db.add(db_group)
    db.flush()
    if group.schedules:
        for s in group.schedules:
            start = s.start_time if hasattr(s.start_time, "hour") else _parse_time(s.start_time)
            end = s.end_time if hasattr(s.end_time, "hour") else _parse_time(s.end_time)
            db.add(GroupSchedule(group_id=db_group.id, day_of_week=s.day_of_week, start_time=start, end_time=end))
    if group.student_ids:
        for student_id in group.student_ids:
            student = db.query(Student).filter(Student.id == student_id).first()
            if student:
                db.add(GroupStudent(group_id=db_group.id, student_id=student_id))
    db.commit()
    db.refresh(db_group)
    log_action(db, current_user.id, "create", "group", db_group.id)
    return _group_to_response(db, db_group)


@router.get("/", response_model=List[GroupResponse])
async def read_groups(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка групп"""
    auth.ensure_permission(current_user, "groups.access")
    effective_role = auth.resolve_effective_role(current_user)
    query = db.query(Group)
    
    # Тренер видит только свои группы
    if effective_role == UserRole.TRAINER:
        query = query.filter(Group.trainer_id == current_user.id)

    # Родитель видит только группы, где есть его активные ученики (текущий состав)
    elif effective_role == UserRole.PARENT:
        query = (
            query.join(GroupStudent)
            .join(Student)
            .filter(
                GroupStudent.left_at.is_(None),
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                Group.status == GroupStatus.ACTIVE,
            )
            .distinct()
        )

    query = query.options(joinedload(Group.group_students).joinedload(GroupStudent.student))
    groups = query.offset(skip).limit(limit).all()

    # Текущий состав: только ученики с left_at IS NULL
    for g in groups:
        g.students = [gs.student for gs in (getattr(g, "group_students", None) or []) if gs.student is not None and getattr(gs, "left_at", None) is None]

    # Не раскрываем состав группы родителю (только его ученики)
    if effective_role == UserRole.PARENT:
        for g in groups:
            try:
                g.students = [s for s in (g.students or []) if s.parent_id == current_user.id and s.status == StudentStatus.ACTIVE]
            except Exception:
                g.students = []

    # ФИО учеников из карточек (где привязана карточка)
    all_student_ids = [s.id for g in groups for s in (g.students or [])]
    display_names = get_students_display_names(db, all_student_ids)
    result = []
    for g in groups:
        students_out = [
            StudentResponse(**{**StudentResponse.model_validate(s).model_dump(), "full_name": display_names.get(s.id, s.full_name)})
            for s in (g.students or [])
        ]
        base = GroupResponse.model_validate(g).model_dump(exclude={"students", "schedules", "programs"})
        base["students"] = students_out
        base["schedules"] = [GroupScheduleResponse.model_validate(s) for s in (getattr(g, "group_schedules", None) or [])]
        base["programs"] = getattr(g, "programs", None) or []
        result.append(GroupResponse(**base))
    return result


@router.get("/paginated", response_model=GroupListResponse)
async def read_groups_paginated(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "groups.access")
    query, effective_role = _build_groups_query(db, current_user)
    total = query.order_by(None).count()
    groups = (
        query.options(joinedload(Group.group_students).joinedload(GroupStudent.student))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "items": _serialize_groups(db, groups, effective_role, current_user),
        "skip": skip,
        "limit": limit,
    }


@router.get("/{group_id}", response_model=GroupResponse)
async def read_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение группы по ID"""
    auth.ensure_permission(current_user, "groups.access")
    effective_role = auth.resolve_effective_role(current_user)
    group = (
        db.query(Group)
        .options(joinedload(Group.group_students).joinedload(GroupStudent.student))
        .filter(Group.id == group_id)
        .first()
    )
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Проверка прав доступа
    if effective_role == UserRole.TRAINER and group.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if effective_role == UserRole.PARENT:
        # Родитель может видеть только группу, где есть его активный ученик (текущий состав)
        has_access = db.query(GroupStudent).join(Student).filter(
            GroupStudent.group_id == group_id,
            GroupStudent.left_at.is_(None),
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")

        # и видит в составе группы только своих активных учеников (уже отфильтровано по текущему составу в _group_to_response)
        try:
            current_students = [gs.student for gs in (group.group_students or []) if gs.student and getattr(gs, "left_at", None) is None]
            group.students = [s for s in current_students if s.parent_id == current_user.id and s.status == StudentStatus.ACTIVE]
        except Exception:
            group.students = []

    return _group_to_response(db, group)


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_update: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage")),
):
    """Обновление группы (admin/owner/sales). В т.ч. units_per_session, extra_rate_per_unit для лимита 8."""
    db_group = db.query(Group).filter(Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_data = group_update.model_dump(exclude_unset=True)
    schedules_payload = update_data.pop("schedules", None)  # list of dicts or None

    # Валидация тренера (если меняем)
    if "trainer_id" in update_data and update_data["trainer_id"] is not None:
        trainer = db.query(User).filter(
            User.id == update_data["trainer_id"],
            User.role == UserRole.TRAINER
        ).first()
        if not trainer:
            raise HTTPException(status_code=404, detail="Trainer not found")

    # Валидация статуса (если меняем)
    if "status" in update_data and update_data["status"] is not None:
        try:
            update_data["status"] = GroupStatus(update_data["status"])
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid group status")

    if "lesson_format" in update_data and update_data["lesson_format"] is not None:
        v = (update_data["lesson_format"] or "").strip().lower()
        update_data["lesson_format"] = "individual" if v == "individual" else "group"

    for field, value in update_data.items():
        setattr(db_group, field, value)

    if group_update.schedules is not None:
        db.query(GroupSchedule).filter(GroupSchedule.group_id == group_id).delete()
        for s in group_update.schedules:
            start = s.start_time if hasattr(s.start_time, "hour") else _parse_time(s.start_time)
            end = s.end_time if hasattr(s.end_time, "hour") else _parse_time(s.end_time)
            db.add(GroupSchedule(group_id=group_id, day_of_week=s.day_of_week, start_time=start, end_time=end))

    db.commit()
    db.refresh(db_group)

    log_action(db, current_user.id, "update", "group", group_id, {**update_data, "schedules_updated": group_update.schedules is not None})
    return _group_to_response(db, db_group)


def _parse_time_str(s: str) -> dt_time:
    parts = str(s).strip().split(":")
    h = int(parts[0]) if len(parts) > 0 else 0
    m = int(parts[1]) if len(parts) > 1 else 0
    return dt_time(hour=h, minute=m, second=0)


@router.get("/{group_id}/lesson-slot-extra-policy", response_model=LessonSlotExtraPolicyResponse)
async def get_lesson_slot_extra_policy(
    group_id: int,
    lesson_date: date = Query(...),
    start_time: str = Query(..., description="HH:MM"),
    end_time: str = Query(..., description="HH:MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage")),
):
    """Получить режим доп. занятий (сверх 8) для слота. По умолчанию free."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    st = _parse_time_str(start_time)
    et = _parse_time_str(end_time)
    try:
        policy = (
            db.query(LessonSlotExtraPolicy)
            .filter(
                LessonSlotExtraPolicy.group_id == group_id,
                LessonSlotExtraPolicy.lesson_date == lesson_date,
                LessonSlotExtraPolicy.start_time == st,
                LessonSlotExtraPolicy.end_time == et,
            )
            .first()
        )
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Lesson slot extra policy table not available. Run migration: alembic upgrade head",
        ) from e
    if not policy:
        return LessonSlotExtraPolicyResponse(
            lesson_date=lesson_date,
            start_time=start_time,
            end_time=end_time,
            extra_policy="free",
            extra_rate_per_unit=None,
        )
    return LessonSlotExtraPolicyResponse(
        lesson_date=policy.lesson_date,
        start_time=policy.start_time.strftime("%H:%M") if policy.start_time else start_time,
        end_time=policy.end_time.strftime("%H:%M") if policy.end_time else end_time,
        extra_policy=policy.extra_policy or "free",
        extra_rate_per_unit=policy.extra_rate_per_unit,
    )


@router.put("/{group_id}/lesson-slot-extra-policy", response_model=LessonSlotExtraPolicyResponse)
async def set_lesson_slot_extra_policy(
    group_id: int,
    payload: LessonSlotExtraPolicyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage")),
):
    """Установить режим доп. занятий (сверх 8) для слота: free или paid. Owner/admin/sales."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if payload.extra_policy not in ("free", "paid"):
        raise HTTPException(status_code=400, detail="extra_policy must be 'free' or 'paid'")
    st = _parse_time_str(payload.start_time)
    et = _parse_time_str(payload.end_time)
    try:
        policy = (
            db.query(LessonSlotExtraPolicy)
            .filter(
                LessonSlotExtraPolicy.group_id == group_id,
                LessonSlotExtraPolicy.lesson_date == payload.lesson_date,
                LessonSlotExtraPolicy.start_time == st,
                LessonSlotExtraPolicy.end_time == et,
            )
            .first()
        )
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Lesson slot extra policy table not available. Run migration: alembic upgrade head",
        ) from e
    if policy:
        policy.extra_policy = payload.extra_policy
        policy.extra_rate_per_unit = payload.extra_rate_per_unit
    else:
        policy = LessonSlotExtraPolicy(
            group_id=group_id,
            lesson_date=payload.lesson_date,
            start_time=st,
            end_time=et,
            extra_policy=payload.extra_policy,
            extra_rate_per_unit=payload.extra_rate_per_unit,
        )
        db.add(policy)
    db.commit()
    db.refresh(policy)
    return LessonSlotExtraPolicyResponse(
        lesson_date=policy.lesson_date,
        start_time=policy.start_time.strftime("%H:%M") if policy.start_time else payload.start_time,
        end_time=policy.end_time.strftime("%H:%M") if policy.end_time else payload.end_time,
        extra_policy=policy.extra_policy or "free",
        extra_rate_per_unit=policy.extra_rate_per_unit,
    )


@router.post("/{group_id}/students/{student_id}")
async def add_student_to_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage"))
):
    """Добавление ученика в группу"""
    group = db.query(Group).filter(Group.id == group_id).first()
    student = db.query(Student).filter(Student.id == student_id).first()
    
    if not group or not student:
        raise HTTPException(status_code=404, detail="Group or student not found")
    
    # Проверка, не добавлен ли уже (учитываем только текущее нахождение в группе, left_at IS NULL)
    existing = db.query(GroupStudent).filter(
        GroupStudent.group_id == group_id,
        GroupStudent.student_id == student_id,
        GroupStudent.left_at.is_(None),
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Student already in group")
    
    group_student = GroupStudent(group_id=group_id, student_id=student_id)
    db.add(group_student)
    log_student_activity(
        db,
        student_id=student_id,
        activity_type="group_joined",
        title="Добавлен в группу",
        description=f"Группа: {group.name}",
        created_by=current_user.id,
        payload_json={"group_id": group.id, "group_name": group.name},
    )
    db.commit()
    
    log_action(db, current_user.id, "add_student", "group", group_id, {"student_id": student_id})
    return {"message": "Student added to group"}


@router.delete("/{group_id}/students/{student_id}")
async def remove_student_from_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage"))
):
    """Удаление ученика из группы (мягкое: проставляем left_at для истории и отчёта характеристик)."""
    group_student = db.query(GroupStudent).filter(
        GroupStudent.group_id == group_id,
        GroupStudent.student_id == student_id,
        GroupStudent.left_at.is_(None),
    ).first()

    if not group_student:
        raise HTTPException(status_code=404, detail="Student not in group")

    from datetime import datetime, timezone
    group_student.left_at = datetime.now(timezone.utc)
    group = db.query(Group).filter(Group.id == group_id).first()
    log_student_activity(
        db,
        student_id=student_id,
        activity_type="group_left",
        title="Выбыл из группы",
        description=f"Группа: {group.name if group else group_id}",
        created_by=current_user.id,
        payload_json={"group_id": group_id, "group_name": group.name if group else None},
    )
    db.commit()
    
    log_action(db, current_user.id, "remove_student", "group", group_id, {"student_id": student_id})
    return {"message": "Student removed from group"}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("groups.manage"))
):
    """Архивация группы (удаление запрещено)"""
    db_group = db.query(Group).filter(Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db_group.status = GroupStatus.ARCHIVED
    db.commit()
    
    log_action(db, current_user.id, "archive", "group", group_id)
    return {"message": "Group archived"}

