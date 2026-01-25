from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas import StudentCreate, StudentResponse, StudentUpdate, ProgramSummaryResponse
from app.models import Student, User, StudentStatus, UserRole
from app.routers.action_log import log_action

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
    
    db_student = Student(
        full_name=student.full_name,
        parent_id=student.parent_id if student.parent_id else None,
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
    elif current_user.role == UserRole.ADMIN:
        if status_filter:
            query = query.filter(Student.status == status_filter)
    
    students = query.offset(skip).limit(limit).all()
    return students


@router.get("/{student_id}", response_model=StudentResponse)
async def read_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение ученика по ID"""
    student = db.query(Student).filter(Student.id == student_id).first()
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
    
    return student


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
    direct = db.query(StudentProgram.program_id).filter(StudentProgram.student_id == student_id).all()
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

