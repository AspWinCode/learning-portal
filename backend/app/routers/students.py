from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas import StudentCreate, StudentResponse, StudentUpdate, ProgramSummaryResponse, StudentAccountCreate, StudentAccountResponse
from app.models import Student, User, StudentStatus, UserRole, Abonement, AbonementStatus, StudentProgram, StudentProgramLinkStatus, StudentAccount, LessonAttendance, Group
from app.routers.action_log import log_action
from app.student_display import get_student_display_name, get_students_display_names

router = APIRouter()


@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Создание ученика (только администратор)"""
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
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка учеников"""
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
    # Администратор видит всех
    elif current_user.role in (UserRole.ADMIN, UserRole.OWNER):
        if status_filter:
            query = query.filter(Student.status == status_filter)
    
    query = query.options(
        selectinload(Student.student_programs).joinedload(StudentProgram.program)
    )
    students = query.offset(skip).limit(limit).all()
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
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Обновление ученика (только администратор)"""
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
    """Список счетов ученика. Доступ: admin, owner, trainer (свои ученики), parent (свои)."""
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
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    accounts = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).order_by(StudentAccount.created_at).all()
    return accounts


@router.post("/{student_id}/accounts", response_model=StudentAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_student_account(
    student_id: int,
    payload: StudentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """Создать счет ученику. Только admin/owner."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название счета обязательно")
    account = StudentAccount(student_id=student_id, name=name, balance=0.0)
    db.add(account)
    db.commit()
    db.refresh(account)
    log_action(db, current_user.id, "create", "student_account", account.id, {"student_id": student_id, "name": name})
    return account

