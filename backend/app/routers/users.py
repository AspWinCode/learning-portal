from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas import UserCreate, UserListResponse, UserResponse, UserUpdate, ParentInviteRequest, ParentInviteResponse
from app.models import User, UserRole, Role
from app.routers.action_log import log_action
from app.services.parent_invite import create_parent_with_invite
from app.services.person_sync import sync_user_person
from app.utils.phone import normalize_phone

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
    if "phone" in data:
        db_user.phone_normalized = normalize_phone(data.get("phone")) or None


def _resolve_custom_role(
    db: Session,
    custom_role_id: Optional[int],
    expected_role: Optional[UserRole] = None,
) -> Optional[Role]:
    if custom_role_id is None:
        return None
    custom_role = db.query(Role).filter(Role.id == custom_role_id).first()
    if custom_role is None or not custom_role.is_active:
        raise HTTPException(status_code=400, detail="Custom role not found or inactive")
    if expected_role is not None and custom_role.base_role != expected_role:
        raise HTTPException(
            status_code=400,
            detail=f"Custom role base_role must match selected role '{expected_role.value}'",
        )
    return custom_role


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("users.manage"))
):
    """Создание пользователя (admin, owner). Для тренера можно сразу заполнить профиль."""
    db_user = auth.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    custom_role = _resolve_custom_role(db, user.custom_role_id, UserRole(user.role))
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=UserRole(user.role),
        custom_role_id=custom_role.id if custom_role else None,
    )
    db.add(db_user)
    db.flush()
    sync_user_person(db, db_user)
    db.commit()
    db.refresh(db_user)
    if user.role == UserRole.TRAINER:
        payload = user.model_dump(exclude_unset=True)
        for k in ("email", "full_name", "role", "password", "custom_role_id"):
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
    current_user: User = Depends(auth.require_permission("users.manage"))
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
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role == UserRole.SALES:
        role = "trainer"
    elif not auth.has_permission(current_user, "users.access"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    query = db.query(User)
    if role:
        query = query.filter(User.role == UserRole(role))
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/paginated", response_model=UserListResponse)
async def read_users_paginated(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role == UserRole.SALES:
        role = "trainer"
    elif not auth.has_permission(current_user, "users.access"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    query = db.query(User)
    if role:
        query = query.filter(User.role == UserRole(role))
    total = query.order_by(None).count()
    users = query.offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": users,
        "skip": skip,
        "limit": limit,
    }


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
    if auth.has_permission(current_user, "users.access"):
        return user
    if auth.resolve_effective_role(current_user) == UserRole.SALES and auth.resolve_effective_role(user) == UserRole.TRAINER:
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
    effective_role = auth.resolve_effective_role(current_user)
    if effective_role == UserRole.SALES:
        if auth.resolve_effective_role(db_user) != UserRole.TRAINER:
            raise HTTPException(status_code=403, detail="Sales can only update trainers")
    elif not auth.has_permission(current_user, "users.manage"):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = user_update.model_dump(exclude_unset=True)
    if effective_role == UserRole.SALES and any(key in update_data for key in ("role", "custom_role_id", "is_active")):
        raise HTTPException(status_code=403, detail="Sales cannot change role assignments")

    if "custom_role_id" in update_data:
        requested_role = update_data.get("role", db_user.role)
        custom_role = _resolve_custom_role(db, update_data["custom_role_id"], UserRole(requested_role))
        db_user.custom_role_id = custom_role.id if custom_role else None
        if custom_role is not None:
            db_user.role = custom_role.base_role
        update_data["custom_role_id"] = db_user.custom_role_id
        update_data["role"] = db_user.role

    if "role" in update_data and "custom_role_id" not in update_data:
        db_user.role = UserRole(update_data["role"])
        update_data["role"] = db_user.role
        if db_user.custom_role_id is not None and db_user.custom_role and db_user.custom_role.base_role != db_user.role:
            db_user.custom_role_id = None
            update_data["custom_role_id"] = None

    for field, value in update_data.items():
        setattr(db_user, field, value)
    sync_user_person(db, db_user)
    db.commit()
    db.refresh(db_user)
    log_action(db, current_user.id, "update", "user", user_id, update_data)
    return db_user


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("users.manage"))
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
