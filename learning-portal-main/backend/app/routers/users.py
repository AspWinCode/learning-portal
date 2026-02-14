from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.models import User, UserRole
from app.routers.action_log import log_action

router = APIRouter()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Создание пользователя (только администратор)"""
    db_user = auth.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=UserRole(user.role)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    log_action(db, current_user.id, "create", "user", db_user.id)
    return db_user


@router.get("/", response_model=List[UserResponse])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Получение списка пользователей (только администратор)"""
    query = db.query(User)
    if role:
        query = query.filter(User.role == UserRole(role))
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение пользователя по ID"""
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER) and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Обновление пользователя (только администратор)"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.dict(exclude_unset=True)
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

