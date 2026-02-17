from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas import GroupCreate, GroupResponse, GroupUpdate
from app.models import Group, User, GroupStatus, UserRole, GroupStudent, Student, StudentStatus, GroupSchedule
from app.schemas import GroupScheduleCreate, GroupScheduleResponse
from app.routers.action_log import log_action

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
                # безопасный фолбэк: если relationship не загрузился/не доступен
                g.students = []
    return groups


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


@router.get("/{group_id}/schedules", response_model=List[GroupScheduleResponse])
async def list_group_schedules(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Расписание занятий группы. Админ, owner или тренер этой группы (просмотр)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.role == UserRole.TRAINER and group.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your group")
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.TRAINER):
        raise HTTPException(status_code=403, detail="Forbidden")
    schedules = db.query(GroupSchedule).filter(GroupSchedule.group_id == group_id).order_by(
        GroupSchedule.day_of_week, GroupSchedule.start_time
    ).all()
    return schedules


@router.post("/{group_id}/schedules", response_model=GroupScheduleResponse, status_code=status.HTTP_201_CREATED)
async def add_group_schedule(
    group_id: int,
    payload: GroupScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Добавить слот расписания (день недели + время). Только админ или owner."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Only admin or owner can add schedule")
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not (0 <= payload.day_of_week <= 6):
        raise HTTPException(status_code=400, detail="day_of_week must be 0-6 (Mon-Sun)")
    sched = GroupSchedule(
        group_id=group_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return sched


@router.delete("/{group_id}/schedules/{schedule_id}")
async def delete_group_schedule(
    group_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Удалить слот расписания. Только админ или owner."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Only admin or owner can delete schedule")
    sched = db.query(GroupSchedule).filter(
        GroupSchedule.id == schedule_id,
        GroupSchedule.group_id == group_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(sched)
    db.commit()
    return {"message": "Schedule deleted"}


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

