from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func, or_
from app.database import get_db
from app import auth
from app.schemas.programs import ProgramSummaryResponse
from app.schemas.students import (
    InviteParentResponse,
    StudentAccountCreate,
    StudentAccountResponse,
    StudentActivityLogResponse,
    StudentCreate,
    StudentListResponse,
    StudentResponse,
    StudentUpdate,
    StudentWithParentCreate,
    StudentWithParentResponse,
)
from app.models import Student, User, StudentStatus, UserRole, Abonement, AbonementStatus, DiscountType, StudentProgram, StudentProgramLinkStatus, StudentAccount, StudentAccountTransaction, LessonAttendance, Group, StudentActivityLog, Grade, Program, ProgramStatus, Topic, Module
from app.routers.action_log import log_action
from app.student_display import get_student_display_name, get_students_display_names
from app.services.parent_invite import create_parent_user_no_invite, create_invite_for_existing_parent
from app.services.student_activity import log_student_activity
from app.services.student_account_finance import ensure_default_student_account

router = APIRouter()


def _validate_student_discount(discount_type: DiscountType, discount_value: float) -> None:
    if discount_value < 0:
        raise HTTPException(status_code=400, detail="Discount must be >= 0")
    if discount_type == DiscountType.PERCENT and discount_value > 100:
        raise HTTPException(status_code=400, detail="Percent discount must be <= 100")


def _normalized_discount_value(discount_type: DiscountType, discount_value: Optional[float]) -> float:
    value = float(discount_value or 0)
    discount_kind = getattr(discount_type, "value", discount_type)
    return 0.0 if discount_kind in (None, DiscountType.NONE.value) else value


def _student_effective_role(current_user: User) -> UserRole:
    return auth.resolve_effective_role(current_user)


def _ensure_student_read_access(db: Session, current_user: User, student: Student) -> UserRole:
    effective_role = _student_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student.id,
            GroupStudent.left_at.is_(None),
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif not auth.has_permission(current_user, "students.access"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return effective_role


def _student_timeline_item(activity: StudentActivityLog) -> StudentActivityLogResponse:
    return StudentActivityLogResponse(
        id=activity.id,
        student_id=activity.student_id,
        event_type=activity.type,
        title=activity.title,
        description=activity.description,
        actor_user_id=activity.created_by,
        actor_user_name=activity.creator.full_name if activity.creator else None,
        created_at=activity.created_at,
        payload_json=activity.payload_json,
    )


def _build_students_query(
    db: Session,
    current_user: User,
    status_filter: Optional[StudentStatus],
    q: Optional[str],
    ids: Optional[str],
):
    effective_role = _student_effective_role(current_user)
    query = db.query(Student)

    if effective_role == UserRole.PARENT:
        query = query.filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE,
        )
    elif effective_role == UserRole.TRAINER:
        from app.models import GroupStudent, Group

        subq = (
            db.query(Student.id)
            .join(GroupStudent, GroupStudent.student_id == Student.id)
            .join(Group, Group.id == GroupStudent.group_id)
            .filter(
                Group.trainer_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
            )
            .distinct()
        )
        query = query.filter(Student.id.in_(subq))
    elif effective_role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        if status_filter:
            query = query.filter(Student.status == status_filter)

    if ids and ids.strip():
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(Student.id.in_(id_list))
        return query

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(Student.full_name.ilike(term))

    return query


def _serialize_students(db: Session, students: List[Student]) -> List[StudentResponse]:
    seen_ids = set()
    unique_students: List[Student] = []
    for student in students:
        if student.id not in seen_ids:
            seen_ids.add(student.id)
            unique_students.append(student)
    if not unique_students:
        return []

    display_names = get_students_display_names(db, [student.id for student in unique_students])
    return [
        StudentResponse(
            **{
                **StudentResponse.model_validate(student).model_dump(),
                "full_name": display_names.get(student.id, student.full_name),
                "in_group": any(getattr(group_student, "left_at", None) is None for group_student in (student.group_students or [])),
            }
        )
        for student in unique_students
    ]


@router.post("/with-parent", response_model=StudentWithParentResponse, status_code=status.HTTP_201_CREATED)
async def create_student_with_parent(
    payload: StudentWithParentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.create")),
):
    """
    Композитное создание: ученик + родитель (найти по id/email или создать нового).
    В одной транзакции: определить/создать parent → создать student с parent_id.
    """
    parent_user = None
    # Безопасно получаем id родителя: parent может быть объектом { id, ... } или по ошибке передан как int
    parent_id = payload.parent if isinstance(payload.parent, int) else getattr(payload.parent, "id", None)
    email_normalized = (getattr(payload.parent, "email", None) or "").strip().lower() if getattr(payload.parent, "email", None) else None

    if parent_id is not None:
        parent_user = db.query(User).filter(User.id == parent_id, User.role == UserRole.PARENT).first()
        if not parent_user:
            raise HTTPException(status_code=404, detail="Родитель с указанным id не найден")
    else:
        if not email_normalized:
            raise HTTPException(status_code=400, detail="Укажите email родителя или выберите существующего")
        found = db.query(User).filter(User.role == UserRole.PARENT, User.email == email_normalized).all()
        if len(found) > 1:
            raise HTTPException(
                status_code=409,
                detail="Найдено несколько родителей с таким email. Выберите вручную.",
            )
        if len(found) == 1:
            parent_user = found[0]
        else:
            try:
                parent_full_name = getattr(payload.parent, "full_name", None) or ""
                parent_user = create_parent_user_no_invite(
                    db, email_normalized, parent_full_name
                )
                db.flush()
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

    # Гарантируем, что parent_user — объект User (не int), иначе сериализация ответа даёт AttributeError
    if parent_user is not None and not isinstance(parent_user, User):
        pid = int(parent_user) if isinstance(parent_user, (int, float)) else None
        if pid is not None:
            parent_user = db.query(User).filter(User.id == pid, User.role == UserRole.PARENT).first()
        if not parent_user or not isinstance(parent_user, User):
            raise HTTPException(status_code=500, detail="Ошибка при определении родителя")

    abonement_id = None
    if payload.student.abonement_id:
        abonement = db.query(Abonement).filter(Abonement.id == payload.student.abonement_id).first()
        if not abonement:
            raise HTTPException(status_code=404, detail="Abonement not found")
        if abonement.status != AbonementStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Abonement is archived")
        abonement_id = abonement.id

    _validate_student_discount(payload.student.discount_type, float(payload.student.discount_value or 0))

    db_student = Student(
        full_name=payload.student.full_name.strip(),
        parent_id=parent_user.id,
        abonement_id=abonement_id,
        discount_type=payload.student.discount_type,
        discount_value=_normalized_discount_value(payload.student.discount_type, payload.student.discount_value),
        status=StudentStatus.ACTIVE,
    )
    db.add(db_student)
    db.flush()
    ensure_default_student_account(db, db_student.id)
    db.commit()
    db.refresh(db_student)
    db.refresh(parent_user)
    log_student_activity(
        db,
        student_id=db_student.id,
        activity_type="enrolled",
        title="Ученик создан",
        description=f"Создан вместе с родителем {parent_user.full_name}",
        created_by=current_user.id,
        payload_json={"source": "students.with_parent"},
    )
    db.commit()
    db.refresh(db_student)

    log_action(db, current_user.id, "create", "student", db_student.id)

    display_name = get_student_display_name(db, db_student)
    student_response = StudentResponse(
        id=db_student.id,
        full_name=display_name,
        parent_id=db_student.parent_id,
        abonement_id=db_student.abonement_id,
        discount_type=db_student.discount_type,
        discount_value=db_student.discount_value,
        status=db_student.status,
        created_at=db_student.created_at,
        parent=parent_user,
        abonement=db_student.abonement,
        programs=[],
    )
    from app.schemas.students import ParentInfoInResponse
    return StudentWithParentResponse(
        student=student_response,
        parent=ParentInfoInResponse(id=parent_user.id, full_name=parent_user.full_name, email=parent_user.email),
    )


@router.get("/parents/search", response_model=List[dict])
async def search_parents(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.create")),
):
    """Поиск родителей по email или ФИО для выбора при создании ученика."""
    term = f"%{q.strip()}%"
    users = (
        db.query(User)
        .filter(
            User.role == UserRole.PARENT,
            or_(User.email.ilike(term), User.full_name.ilike(term)),
        )
        .order_by(User.full_name)
        .limit(limit)
        .all()
    )
    return [{"id": u.id, "full_name": u.full_name, "email": u.email} for u in users]


@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.create")),
):
    """Создание ученика (admin, owner, sales)."""
    # Проверка существования родителя (если указан)
    if student.parent_id:
        parent = db.query(User).filter(
            User.id == student.parent_id,
            User.role == UserRole.PARENT
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent not found")
    
    abonement_id = None
    if student.abonement_id:
        abonement = db.query(Abonement).filter(Abonement.id == student.abonement_id).first()
        if not abonement:
            raise HTTPException(status_code=404, detail="Abonement not found")
        if abonement.status != AbonementStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Abonement is archived")
        abonement_id = abonement.id

    _validate_student_discount(student.discount_type, float(student.discount_value or 0))

    db_student = Student(
        full_name=student.full_name,
        parent_id=student.parent_id if student.parent_id else None,
        abonement_id=abonement_id,
        discount_type=student.discount_type,
        discount_value=_normalized_discount_value(student.discount_type, student.discount_value),
        status=StudentStatus.ACTIVE
    )
    db.add(db_student)
    db.flush()
    ensure_default_student_account(db, db_student.id)
    db.commit()
    db.refresh(db_student)
    log_student_activity(
        db,
        student_id=db_student.id,
        activity_type="enrolled",
        title="Ученик создан",
        description="Ученик добавлен в систему",
        created_by=current_user.id,
        payload_json={"source": "students.create"},
    )
    db.commit()
    db.refresh(db_student)
    
    log_action(db, current_user.id, "create", "student", db_student.id)
    return db_student


@router.get("/paginated", response_model=StudentListResponse)
async def read_students_paginated(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[StudentStatus] = Query(None, alias="status"),
    q: Optional[str] = Query(None, description="Поиск по ФИО (подстрока)"),
    ids: Optional[str] = Query(None, description="Список ID через запятую"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "students.access")
    query = _build_students_query(db, current_user, status_filter, q, ids)
    total = query.with_entities(func.count(Student.id)).scalar() or 0
    rows = (
        query.options(
            selectinload(Student.student_programs).joinedload(StudentProgram.program),
            selectinload(Student.group_students),
        )
        .order_by(Student.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return StudentListResponse(
        total=total,
        items=_serialize_students(db, rows),
        skip=skip,
        limit=limit,
    )


@router.get("/", response_model=List[StudentResponse])
async def read_students(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[StudentStatus] = Query(None, alias="status"),
    q: Optional[str] = Query(None, description="Поиск по ФИО (подстрока)"),
    ids: Optional[str] = Query(None, description="Список ID через запятую (вернуть только этих учеников)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка учеников. q — поиск по имени/фамилии/отчеству, ids — выбор по ID."""
    auth.ensure_permission(current_user, "students.access")
    effective_role = _student_effective_role(current_user)
    query = db.query(Student)
    
    # Родитель видит только своих активных учеников
    if effective_role == UserRole.PARENT:
        query = query.filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        )
    # Тренер видит только учеников из своих групп (подзапрос, чтобы не дублировать ученика в нескольких группах)
    elif effective_role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        subq = (
            db.query(Student.id)
            .join(GroupStudent, GroupStudent.student_id == Student.id)
            .join(Group, Group.id == GroupStudent.group_id)
            .filter(
                Group.trainer_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
            )
            .distinct()
        )
        query = query.filter(Student.id.in_(subq))
    # Администратор, владелец и sales видят всех
    elif effective_role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        if status_filter:
            query = query.filter(Student.status == status_filter)
    
    if ids and ids.strip():
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(Student.id.in_(id_list))
    else:
        if q and q.strip():
            term = f"%{q.strip()}%"
            query = query.filter(Student.full_name.ilike(term))
        query = query.offset(skip).limit(limit)
    
    query = query.options(
        selectinload(Student.student_programs).joinedload(StudentProgram.program),
        selectinload(Student.group_students),
    )
    rows = query.all()
    # Убираем дубликаты по id (могут появиться при join в других ветках)
    seen_ids = set()
    students = []
    for s in rows:
        if s.id not in seen_ids:
            seen_ids.add(s.id)
            students.append(s)
    if not students:
        return []
    # Pass pre-loaded students to avoid N+1 query
    display_names = get_students_display_names(db, [s.id for s in students], students=students)
    return [
        StudentResponse(
            **{
                **StudentResponse.model_validate(s).model_dump(),
                "full_name": display_names.get(s.id, s.full_name),
                "in_group": any(getattr(gs, "left_at", None) is None for gs in (s.group_students or [])),
            }
        )
        for s in students
    ]


@router.get("/{student_id}", response_model=StudentResponse)
async def read_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение ученика по ID"""
    student = (
        db.query(Student)
        .options(
            selectinload(Student.student_programs).joinedload(StudentProgram.program),
            selectinload(Student.group_students),
        )
        .filter(Student.id == student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Проверка прав доступа
    _ensure_student_read_access(db, current_user, student)
    display_name = get_student_display_name(db, student)
    in_group = any(getattr(gs, "left_at", None) is None for gs in (student.group_students or []))
    return StudentResponse(
        **{**StudentResponse.model_validate(student).model_dump(), "full_name": display_name, "in_group": in_group}
    )


@router.post("/{student_id}/invite-parent", response_model=InviteParentResponse)
async def invite_parent_for_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.invite_parent")),
):
    """Сгенерировать ссылку-приглашение для родителя ученика (установка пароля / вход в кабинет)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not student.parent_id:
        raise HTTPException(status_code=400, detail="У ученика не указан родитель")
    parent_user = db.query(User).filter(User.id == student.parent_id).first()
    if not parent_user or auth.resolve_effective_role(parent_user) != UserRole.PARENT:
        raise HTTPException(status_code=404, detail="Родитель не найден")
    invite_link = create_invite_for_existing_parent(db, parent_user)
    db.commit()
    log_action(db, current_user.id, "invite_parent", "student", student_id)
    return InviteParentResponse(invite_link=invite_link)


@router.get("/{student_id}/attendances")
async def get_student_attendances(
    student_id: int,
    limit: int = Query(100, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Посещение занятий ученика: последние записи с датой, группой и статусом (был/не был)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _ensure_student_read_access(db, current_user, student)
    rows = (
        db.query(LessonAttendance, Group.name)
        .join(Group, LessonAttendance.group_id == Group.id)
        .filter(LessonAttendance.student_id == student_id)
        .order_by(LessonAttendance.lesson_date.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "lesson_date": att.lesson_date.isoformat() if hasattr(att.lesson_date, "isoformat") else str(att.lesson_date),
            "group_name": group_name,
            "attended": att.attended,
        }
        for att, group_name in rows
    ]


@router.get("/{student_id}/timeline", response_model=List[StudentActivityLogResponse])
async def get_student_timeline(
    student_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    event_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    effective_role = _student_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif not auth.has_permission(current_user, "students.access"):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    query = (
        db.query(StudentActivityLog)
        .options(joinedload(StudentActivityLog.creator))
        .filter(StudentActivityLog.student_id == student_id)
    )
    if event_type:
        query = query.filter(StudentActivityLog.type == event_type)
    if date_from:
        query = query.filter(StudentActivityLog.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(StudentActivityLog.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))

    items = query.order_by(StudentActivityLog.created_at.desc(), StudentActivityLog.id.desc()).offset(offset).limit(limit).all()
    return [_student_timeline_item(item) for item in items]


@router.get("/{student_id}/program-options", response_model=List[ProgramSummaryResponse])
async def get_student_program_options(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Список программ для ученика (назначенные напрямую + через группы)"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # RBAC
    _ensure_student_read_access(db, current_user, student)

    from app.models import StudentProgram, GroupProgram, GroupStudent, Program

    program_ids = set()
    direct = db.query(StudentProgram.program_id).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
    ).all()
    for (pid,) in direct:
        if pid:
            program_ids.add(pid)

    group_pids = db.query(GroupProgram.program_id).join(GroupStudent, GroupStudent.group_id == GroupProgram.group_id).filter(
        GroupStudent.student_id == student_id
    ).all()
    for (pid,) in group_pids:
        if pid:
            program_ids.add(pid)

    if not program_ids:
        return []

    programs = db.query(Program).filter(Program.id.in_(list(program_ids))).all()
    # Sort by name then version desc for nicer UX
    programs.sort(key=lambda p: (p.name or "", -(p.version or 0)))
    return programs


@router.post("/{student_id}/programs/{program_id}", status_code=status.HTTP_200_OK)
async def assign_program_to_student(
    student_id: int,
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.assign_program")),
):
    """Назначить программу ученику. Если назначение уже есть — реактивировать. Идемпотентно."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.status != ProgramStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Нельзя назначить архивную программу")

    link = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.program_id == program_id,
    ).first()

    if link:
        if link.status == StudentProgramLinkStatus.ACTIVE:
            return {"message": "Program already assigned to this student"}
        link.status = StudentProgramLinkStatus.ACTIVE
        db.commit()
        log_action(db, current_user.id, "reactivate_program", "student", student_id, {"program_id": program_id})
        return {"message": "Program assignment reactivated"}

    link = StudentProgram(
        student_id=student_id,
        program_id=program_id,
        status=StudentProgramLinkStatus.ACTIVE,
    )
    db.add(link)
    db.commit()
    log_action(db, current_user.id, "assign_program", "student", student_id, {"program_id": program_id})
    return {"message": "Program assigned to student"}


@router.delete("/{student_id}/programs/{program_id}")
async def unassign_program_from_student(
    student_id: int,
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.assign_program"))
):
    """Снять программу с ученика. Запрещено если по программе уже есть оценки."""
    link = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.program_id == program_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Program not assigned to this student")
    if link.status == StudentProgramLinkStatus.ARCHIVED:
        return {"message": "Program assignment already archived"}

    has_grades = (
        db.query(Grade)
        .join(Topic, Grade.topic_id == Topic.id)
        .join(Module, Topic.module_id == Module.id)
        .filter(
            Grade.student_id == student_id,
            Module.program_id == program_id,
        )
        .first()
    )
    if has_grades:
        raise HTTPException(
            status_code=400,
            detail="Нельзя снять программу: по ней уже есть оценки у ученика",
        )

    link.status = StudentProgramLinkStatus.ARCHIVED
    db.commit()
    log_action(db, current_user.id, "unassign_program", "student", student_id, {"program_id": program_id})
    return {"message": "Program unassigned from student (archived)"}


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.edit")),
):
    """Обновление ученика (admin, owner, sales)."""
    db_student = db.query(Student).filter(Student.id == student_id).first()
    if db_student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    
    update_data = student_update.dict(exclude_unset=True)
    
    # Проверка существования родителя (если указан)
    if "parent_id" in update_data:
        if update_data["parent_id"]:
            parent = db.query(User).filter(
                User.id == update_data["parent_id"],
                User.role == UserRole.PARENT
            ).first()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent not found")
        else:
            update_data["parent_id"] = None

    # Проверка абонемента (если указан)
    if "abonement_id" in update_data:
        if update_data["abonement_id"]:
            abonement = db.query(Abonement).filter(Abonement.id == update_data["abonement_id"]).first()
            if not abonement:
                raise HTTPException(status_code=404, detail="Abonement not found")
            if abonement.status != AbonementStatus.ACTIVE:
                raise HTTPException(status_code=400, detail="Abonement is archived")
        else:
            update_data["abonement_id"] = None

    if "discount_type" in update_data or "discount_value" in update_data:
        discount_type = update_data.get("discount_type", db_student.discount_type) or DiscountType.NONE
        discount_value = update_data.get("discount_value", db_student.discount_value)
        _validate_student_discount(discount_type, float(discount_value or 0))
        update_data["discount_type"] = discount_type
        update_data["discount_value"] = _normalized_discount_value(discount_type, discount_value)
    
    # При архивации проверяем, нужно ли деактивировать родителя
    if "status" in update_data and update_data["status"] == StudentStatus.ARCHIVED:
        if db_student.parent_id:
            # Проверяем, есть ли у родителя другие активные ученики
            active_students_count = db.query(Student).filter(
                Student.parent_id == db_student.parent_id,
                Student.status == StudentStatus.ACTIVE,
                Student.id != student_id
            ).count()
            
            if active_students_count == 0:
                # Деактивируем родителя
                parent = db.query(User).filter(User.id == db_student.parent_id).first()
                if parent:
                    parent.is_active = False
    # При разархивации активируем родителя (если есть привязка)
    elif "status" in update_data and update_data["status"] == StudentStatus.ACTIVE:
        # parent может быть обновлен в этом же запросе через update_data["parent_id"]
        parent_id_to_activate = update_data.get("parent_id", db_student.parent_id)
        if parent_id_to_activate:
            parent = db.query(User).filter(User.id == parent_id_to_activate).first()
            if parent and parent.role == UserRole.PARENT:
                parent.is_active = True
    
    for field, value in update_data.items():
        setattr(db_student, field, value)

    if "training_start_date" in update_data and update_data["training_start_date"] is not None:
        from app.services.student_card_period import set_card_payment_dates_from_training_start
        set_card_payment_dates_from_training_start(db, student_id, update_data["training_start_date"])
    
    db.commit()
    db.refresh(db_student)
    
    log_action(db, current_user.id, "update", "student", student_id, update_data)
    return db_student


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("students.delete"))
):
    """Архивация ученика (удаление запрещено)"""
    db_student = db.query(Student).filter(Student.id == student_id).first()
    if db_student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Архивируем вместо удаления
    db_student.status = StudentStatus.ARCHIVED
    db.commit()
    
    # Проверяем, нужно ли деактивировать родителя
    active_students_count = db.query(Student).filter(
        Student.parent_id == db_student.parent_id,
        Student.status == StudentStatus.ACTIVE
    ).count()
    
    if active_students_count == 0:
        parent = db.query(User).filter(User.id == db_student.parent_id).first()
        if parent:
            parent.is_active = False
            db.commit()
    
    log_action(db, current_user.id, "archive", "student", student_id)
    return {"message": "Student archived"}



@router.get("/{student_id}/accounts", response_model=List[StudentAccountResponse])
async def list_student_accounts(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Student account list."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    auth.ensure_permission(current_user, "student_accounts.access")
    _ensure_student_read_access(db, current_user, student)
    accounts = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).order_by(StudentAccount.created_at).all()
    return accounts


@router.post("/{student_id}/accounts", response_model=StudentAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_student_account(
    student_id: int,
    payload: StudentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Create student account."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    auth.ensure_permission(current_user, "student_accounts.manage")
    _ensure_student_read_access(db, current_user, student)
    from app.services.student_account_finance import create_student_account as finance_create_student_account
    try:
        account = finance_create_student_account(db, student_id, payload.name or "")
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    db.commit()
    db.refresh(account)
    log_action(db, current_user.id, "create", "student_account", account.id, {"student_id": student_id, "name": account.name})
    return account


@router.delete("/{student_id}/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_account(
    student_id: int,
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("student_accounts.manage")),
):
    """Удалить счёт ученика. Только счёт без операций."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    account = db.query(StudentAccount).filter(
        StudentAccount.id == account_id,
        StudentAccount.student_id == student_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Счет не найден")
    has_tx = db.query(StudentAccountTransaction).filter(StudentAccountTransaction.account_id == account_id).first()
    if has_tx:
        raise HTTPException(status_code=400, detail="Нельзя удалить счет с операциями")
    db.delete(account)
    db.commit()
    log_action(db, current_user.id, "delete", "student_account", account_id, {})
    return None

