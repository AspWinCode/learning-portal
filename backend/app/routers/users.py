from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas import UserCreate, UserResponse, UserUpdate, ParentInviteRequest, ParentInviteResponse
from app.models import User, UserRole
from app.routers.action_log import log_action
from app.services.parent_invite import create_parent_with_invite

router = APIRouter()


def _apply_trainer_profile(db_user: User, data: dict) -> None:
    """Записать поля профиля тренера из словаря (create/update)."""
    for key in (
        "phone", "phone_extra", "trainer_lesson_formats", "trainer_banks",
        "city", "trainer_telegram", "is_self_employed", "is_ip",
        "work_schedule", "qualification", "trainer_comment",
    ):
        if key in data and data[key] is not None:
            setattr(db_user, key, data[key])


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"]))
):
    """Создание пользователя (admin, owner). Для тренера можно сразу заполнить профиль."""
    db_user = auth.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth.get_password_hash(user.password)
    db_user = User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=UserRole(user.role),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    if user.role == UserRole.TRAINER:
        payload = user.model_dump(exclude_unset=True)
        for k in ("email", "full_name", "role", "password"):
            payload.pop(k, None)
        _apply_trainer_profile(db_user, payload)
        db.commit()
        db.refresh(db_user)
    log_action(db, current_user.id, "create", "user", db_user.id)
    return db_user


@router.post("/invite-parent", response_model=ParentInviteResponse, status_code=status.HTTP_201_CREATED)
async def invite_parent(
    payload: ParentInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"]))
):
    """
    Приглашение нового родителя: создаётся пользователь с ролью parent без пароля,
    выдаётся ссылка для установки пароля. Существующих родителей не меняем.
    """
    try:
        db_user, invite_link = create_parent_with_invite(
            db, payload.email, payload.full_name
        )
        db.commit()
        db.refresh(db_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_action(db, current_user.id, "invite_parent", "user", db_user.id)
    return ParentInviteResponse(
        user_id=db_user.id,
        email=db_user.email,
        full_name=db_user.full_name,
        invite_link=invite_link,
    )


@router.get("/", response_model=List[UserResponse])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Список пользователей. Admin, owner — любые; sales — только тренеры (role=trainer)."""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if current_user.role == UserRole.SALES:
        role = "trainer"
    query = db.query(User)
    if role:
        query = query.filter(User.role == UserRole(role))
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Получение пользователя по ID. Профиль тренера виден owner, admin, sales."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.id == user_id:
        return user
    if current_user.role in (UserRole.ADMIN, UserRole.OWNER):
        return user
    if current_user.role == UserRole.SALES and user.role == UserRole.TRAINER:
        return user
    raise HTTPException(status_code=403, detail="Not enough permissions")


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Обновление пользователя. Admin, owner — любые; sales — только тренеры (профиль)."""
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == UserRole.SALES:
        if db_user.role != UserRole.TRAINER:
            raise HTTPException(status_code=403, detail="Sales can only update trainers")
    elif current_user.role not in (UserRole.ADMIN, UserRole.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_user, field, value)
    db.commit()
    db.refresh(db_user)
    log_action(db, current_user.id, "update", "user", user_id, update_data)
    return db_user


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Деактивация пользователя (удаление запрещено)"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Проверка связанных данных
    from app.models import Student, Group, Grade, Characteristic
    has_students = db.query(Student).filter(Student.parent_id == user_id).count() > 0
    has_groups = db.query(Group).filter(Group.trainer_id == user_id).count() > 0
    has_grades = db.query(Grade).filter(Grade.trainer_id == user_id).count() > 0
    has_characteristics = db.query(Characteristic).filter(Characteristic.trainer_id == user_id).count() > 0
    
    if has_students or has_groups or has_grades or has_characteristics:
        # Деактивация вместо удаления
        db_user.is_active = False
        db.commit()
        log_action(db, current_user.id, "deactivate", "user", user_id)
        return {"message": "User deactivated (cannot delete due to related data)"}
    
    # Если нет связанных данных, можно удалить
    db.delete(db_user)
    db.commit()
    log_action(db, current_user.id, "delete", "user", user_id)
    return {"message": "User deleted"}

