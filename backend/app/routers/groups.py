from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas import GroupCreate, GroupResponse, GroupUpdate, StudentResponse
from app.models import Group, User, GroupStatus, UserRole, GroupStudent, Student, StudentStatus
from app.routers.action_log import log_action
from app.student_display import get_students_display_names

router = APIRouter()


@router.post("/", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Создание группы (только администратор)"""
    # Проверка существования тренера
    trainer = db.query(User).filter(
        User.id == group.trainer_id,
        User.role == UserRole.TRAINER
    ).first()
    if not trainer:
        raise HTTPException(status_code=404, detail="Trainer not found")
    
    db_group = Group(
        name=group.name,
        trainer_id=group.trainer_id,
        status=GroupStatus.ACTIVE
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Добавление учеников
    if group.student_ids:
        for student_id in group.student_ids:
            student = db.query(Student).filter(Student.id == student_id).first()
            if student:
                group_student = GroupStudent(
                    group_id=db_group.id,
                    student_id=student_id
                )
                db.add(group_student)
        db.commit()
    
    log_action(db, current_user.id, "create", "group", db_group.id)
    return db_group


@router.get("/", response_model=List[GroupResponse])
async def read_groups(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка групп"""
    query = db.query(Group)
    
    # Тренер видит только свои группы
    if current_user.role == UserRole.TRAINER:
        query = query.filter(Group.trainer_id == current_user.id)

    # Родитель видит только группы, где есть его активные ученики
    elif current_user.role == UserRole.PARENT:
        query = (
            query.join(GroupStudent)
            .join(Student)
            .filter(
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
                Group.status == GroupStatus.ACTIVE,
            )
            .distinct()
        )
    
    groups = query.offset(skip).limit(limit).all()

    # Не раскрываем состав группы родителю (только его ученики)
    if current_user.role == UserRole.PARENT:
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
        result.append(GroupResponse(**{**GroupResponse.model_validate(g).model_dump(), "students": students_out}))
    return result


@router.get("/{group_id}", response_model=GroupResponse)
async def read_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение группы по ID"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Проверка прав доступа
    if current_user.role == UserRole.TRAINER and group.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if current_user.role == UserRole.PARENT:
        # Родитель может видеть только группу, где есть его активный ученик
        has_access = db.query(GroupStudent).join(Student).filter(
            GroupStudent.group_id == group_id,
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")

        # и видит в составе группы только своих активных учеников
        try:
            group.students = [s for s in (group.students or []) if s.parent_id == current_user.id and s.status == StudentStatus.ACTIVE]
        except Exception:
            group.students = []

    # ФИО учеников из карточек (где привязана карточка)
    student_list = group.students or []
    if student_list:
        display_names = get_students_display_names(db, [s.id for s in student_list])
        students_out = [
            StudentResponse(**{**StudentResponse.model_validate(s).model_dump(), "full_name": display_names.get(s.id, s.full_name)})
            for s in student_list
        ]
        return GroupResponse(**{**GroupResponse.model_validate(group).model_dump(), "students": students_out})
    return group


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_update: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Обновление группы (только администратор)"""
    db_group = db.query(Group).filter(Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_data = group_update.dict(exclude_unset=True)

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

    for field, value in update_data.items():
        setattr(db_group, field, value)
    
    db.commit()
    db.refresh(db_group)
    
    log_action(db, current_user.id, "update", "group", group_id, update_data)
    return db_group


@router.post("/{group_id}/students/{student_id}")
async def add_student_to_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Добавление ученика в группу"""
    group = db.query(Group).filter(Group.id == group_id).first()
    student = db.query(Student).filter(Student.id == student_id).first()
    
    if not group or not student:
        raise HTTPException(status_code=404, detail="Group or student not found")
    
    # Проверка, не добавлен ли уже
    existing = db.query(GroupStudent).filter(
        GroupStudent.group_id == group_id,
        GroupStudent.student_id == student_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Student already in group")
    
    group_student = GroupStudent(group_id=group_id, student_id=student_id)
    db.add(group_student)
    db.commit()
    
    log_action(db, current_user.id, "add_student", "group", group_id, {"student_id": student_id})
    return {"message": "Student added to group"}


@router.delete("/{group_id}/students/{student_id}")
async def remove_student_from_group(
    group_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Удаление ученика из группы"""
    group_student = db.query(GroupStudent).filter(
        GroupStudent.group_id == group_id,
        GroupStudent.student_id == student_id
    ).first()
    
    if not group_student:
        raise HTTPException(status_code=404, detail="Student not in group")
    
    db.delete(group_student)
    db.commit()
    
    log_action(db, current_user.id, "remove_student", "group", group_id, {"student_id": student_id})
    return {"message": "Student removed from group"}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Архивация группы (удаление запрещено)"""
    db_group = db.query(Group).filter(Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db_group.status = GroupStatus.ARCHIVED
    db.commit()
    
    log_action(db, current_user.id, "archive", "group", group_id)
    return {"message": "Group archived"}

