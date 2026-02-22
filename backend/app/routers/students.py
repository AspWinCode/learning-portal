from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas import (
    StudentCreate,
    StudentResponse,
    StudentUpdate,
    ProgramSummaryResponse,
    StudentAccountCreate,
    StudentAccountResponse,
    StudentWithParentCreate,
    StudentWithParentResponse,
    InviteParentResponse,
)
from app.models import Student, User, StudentStatus, UserRole, Abonement, AbonementStatus, StudentProgram, StudentProgramLinkStatus, StudentAccount, LessonAttendance, Group
from app.routers.action_log import log_action
from app.student_display import get_student_display_name, get_students_display_names
from app.services.parent_invite import create_parent_user_no_invite, create_invite_for_existing_parent

router = APIRouter()


@router.post("/with-parent", response_model=StudentWithParentResponse, status_code=status.HTTP_201_CREATED)
async def create_student_with_parent(
    payload: StudentWithParentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
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

    abonement_id = None
    if payload.student.abonement_id:
        abonement = db.query(Abonement).filter(Abonement.id == payload.student.abonement_id).first()
        if not abonement:
            raise HTTPException(status_code=404, detail="Abonement not found")
        if abonement.status != AbonementStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Abonement is archived")
        abonement_id = abonement.id

    db_student = Student(
        full_name=payload.student.full_name.strip(),
        parent_id=parent_user.id,
        abonement_id=abonement_id,
        status=StudentStatus.ACTIVE,
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    db.refresh(parent_user)

    log_action(db, current_user.id, "create", "student", db_student.id)

    display_name = get_student_display_name(db, db_student.id)
    student_response = StudentResponse(
        id=db_student.id,
        full_name=display_name,
        parent_id=db_student.parent_id,
        abonement_id=db_student.abonement_id,
        status=db_student.status,
        created_at=db_student.created_at,
        parent=parent_user,
        abonement=db_student.abonement,
        programs=[],
    )
    from app.schemas import ParentInfoInResponse
    return StudentWithParentResponse(
        student=student_response,
        parent=ParentInfoInResponse(id=parent_user.id, full_name=parent_user.full_name, email=parent_user.email),
    )


@router.get("/parents/search", response_model=List[dict])
async def search_parents(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
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
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
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

    db_student = Student(
        full_name=student.full_name,
        parent_id=student.parent_id if student.parent_id else None,
        abonement_id=abonement_id,
        status=StudentStatus.ACTIVE
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    
    log_action(db, current_user.id, "create", "student", db_student.id)
    return db_student


@router.get("/", response_model=List[StudentResponse])
async def read_students(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[StudentStatus] = Query(None, alias="status"),
    q: Optional[str] = Query(None, description="Поиск по ФИО (подстрока)"),
    ids: Optional[str] = Query(None, description="Список ID через запятую (вернуть только этих учеников)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка учеников. q — поиск по имени/фамилии/отчеству, ids — выбор по ID."""
    query = db.query(Student)
    
    # Родитель видит только своих активных учеников
    if current_user.role == UserRole.PARENT:
        query = query.filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        )
    # Тренер видит только учеников из своих групп
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        query = query.join(GroupStudent).join(Group).filter(
            Group.trainer_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        )
    # Администратор, владелец и sales видят всех
    elif current_user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
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
        selectinload(Student.student_programs).joinedload(StudentProgram.program)
    )
    students = query.all()
    if not students:
        return []
    display_names = get_students_display_names(db, [s.id for s in students])
    return [
        StudentResponse(
            **{**StudentResponse.model_validate(s).model_dump(), "full_name": display_names.get(s.id, s.full_name)}
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
        .options(selectinload(Student.student_programs).joinedload(StudentProgram.program))
        .filter(Student.id == student_id)
        .first()
    )
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Проверка прав доступа
    if current_user.role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    display_name = get_student_display_name(db, student)
    return StudentResponse(
        **{**StudentResponse.model_validate(student).model_dump(), "full_name": display_name}
    )


@router.post("/{student_id}/invite-parent", response_model=InviteParentResponse)
async def invite_parent_for_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """Сгенерировать ссылку-приглашение для родителя ученика (установка пароля / вход в кабинет)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not student.parent_id:
        raise HTTPException(status_code=400, detail="У ученика не указан родитель")
    parent_user = db.query(User).filter(User.id == student.parent_id).first()
    if not parent_user or parent_user.role != UserRole.PARENT:
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
    if current_user.role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent
        has_access = db.query(GroupStudent).join(Group, GroupStudent.group_id == Group.id).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
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
    if current_user.role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")

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


@router.delete("/{student_id}/programs/{program_id}")
async def unassign_program_from_student(
    student_id: int,
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Архивировать назначение программы ученику (логика данных сохраняется)."""
    link = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.program_id == program_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Program not assigned to this student")
    if link.status == StudentProgramLinkStatus.ARCHIVED:
        return {"message": "Program assignment already archived"}
    link.status = StudentProgramLinkStatus.ARCHIVED
    db.commit()
    log_action(db, current_user.id, "unassign_program", "student", student_id, {"program_id": program_id})
    return {"message": "Program unassigned from student (archived)"}


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
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
    
    db.commit()
    db.refresh(db_student)
    
    log_action(db, current_user.id, "update", "student", student_id, update_data)
    return db_student


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
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
    """Список счетов ученика. Доступ: admin, owner, sales, trainer (свои ученики), parent (свои)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if current_user.role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    accounts = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).order_by(StudentAccount.created_at).all()
    return accounts


@router.post("/{student_id}/accounts", response_model=StudentAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_student_account(
    student_id: int,
    payload: StudentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Создать счет ученику. Доступ: admin, owner, sales, trainer (свои ученики), parent (свои)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if current_user.role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == UserRole.TRAINER:
        from app.models import GroupStudent, Group
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название счета обязательно")
    account = StudentAccount(student_id=student_id, name=name, balance=0.0)
    db.add(account)
    db.commit()
    db.refresh(account)
    log_action(db, current_user.id, "create", "student_account", account.id, {"student_id": student_id, "name": name})
    return account

