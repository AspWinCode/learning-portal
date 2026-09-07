from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.schemas.auth import ParentInviteRequest, ParentInviteResponse
from app.schemas.users import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.models import User, UserRole, Role
from app.routers.action_log import log_action
from app.services.parent_invite import create_parent_with_invite
from app.services.email_sender import is_email_configured
from app.services.account_notifications import send_account_credentials_email
from app.services.person_sync import sync_user_person
from app.utils.phone import normalize_phone

router = APIRouter()


ELEVATED_USER_ROLES = {UserRole.ADMIN, UserRole.OWNER}


def _ensure_owner_for_elevated_role_assignment(current_user: User, target_role: UserRole) -> None:
    if target_role in ELEVATED_USER_ROLES and auth.resolve_effective_role(current_user) != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can assign admin or owner roles")


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
    email_normalized = auth.normalize_email(user.email)
    db_user = auth.get_user_by_email(db, email=email_normalized)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        auth.validate_password_strength(user.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    requested_role = UserRole(user.role)
    _ensure_owner_for_elevated_role_assignment(current_user, requested_role)
    custom_role = _resolve_custom_role(db, user.custom_role_id, requested_role)
    if custom_role is not None:
        _ensure_owner_for_elevated_role_assignment(current_user, custom_role.base_role)
    hashed_password = auth.get_password_hash(user.password)
    db_user = User(
        email=email_normalized,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=requested_role,
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
    try:
        send_account_credentials_email(
            to_email=db_user.email,
            full_name=db_user.full_name or "",
            password=user.password,
        )
    except Exception:
        pass
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
    email_sent = is_email_configured()
    return ParentInviteResponse(
        user_id=db_user.id,
        email=db_user.email,
        full_name=db_user.full_name,
        invite_link=invite_link,
        email_sent=email_sent,
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
        requested_role = UserRole(requested_role)
        _ensure_owner_for_elevated_role_assignment(current_user, requested_role)
        custom_role = _resolve_custom_role(db, update_data["custom_role_id"], requested_role)
        if custom_role is not None:
            _ensure_owner_for_elevated_role_assignment(current_user, custom_role.base_role)
        db_user.custom_role_id = custom_role.id if custom_role else None
        if custom_role is not None:
            db_user.role = custom_role.base_role
        update_data["custom_role_id"] = db_user.custom_role_id
        update_data["role"] = db_user.role

    if "role" in update_data and "custom_role_id" not in update_data:
        requested_role = UserRole(update_data["role"])
        _ensure_owner_for_elevated_role_assignment(current_user, requested_role)
        db_user.role = requested_role
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


_FK_LABELS = {
    ("groups", "trainer_id"): "групп как тренер",
    ("grades", "trainer_id"): "оценок как тренер",
    ("characteristics", "trainer_id"): "характеристик как тренер",
}


def _user_fk_columns(db: Session) -> list:
    """Все FK-колонки, ссылающиеся на users.id: (table, column, is_nullable)."""
    rows = db.execute(
        text(
            """
            SELECT kcu.table_name, kcu.column_name, col.is_nullable
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
             AND tc.table_schema = ccu.table_schema
            JOIN information_schema.columns col
              ON col.table_name = kcu.table_name
             AND col.column_name = kcu.column_name
             AND col.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'users'
              AND ccu.column_name = 'id'
            """
        )
    ).fetchall()
    return [(t, c, n) for (t, c, n) in rows if t != "users"]


def _detach_user_references(db: Session, user_id: int) -> List[str]:
    """Отвязать все nullable-ссылки на пользователя (SET NULL).

    Возвращает список NOT NULL-ссылок, которые нельзя обнулить — их наличие
    означает, что пользователя нельзя удалить физически.
    """
    hard_blockers: List[str] = []
    for table_name, column_name, is_nullable in _user_fk_columns(db):
        count = db.execute(
            text(f'SELECT count(*) FROM "{table_name}" WHERE "{column_name}" = :uid'),
            {"uid": user_id},
        ).scalar()
        if not count:
            continue
        if is_nullable == "YES":
            db.execute(
                text(f'UPDATE "{table_name}" SET "{column_name}" = NULL WHERE "{column_name}" = :uid'),
                {"uid": user_id},
            )
        else:
            label = _FK_LABELS.get((table_name, column_name), f"{table_name}.{column_name}")
            hard_blockers.append(f"{label}: {count}")
    return hard_blockers


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    hard: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("users.manage"))
):
    """Удаление пользователя.

    По умолчанию — архивация (is_active=False), если есть связанные данные,
    иначе физическое удаление.

    hard=true — физическое удаление из БД. Доступно только владельцу (owner).
    Все необязательные ссылки на пользователя обнуляются автоматически
    (журнал действий, задачи и т.п.). Если остаются обязательные связи
    (группы, оценки, характеристики как тренер) — возвращается 409 со
    списком, их нужно переназначить вручную перед удалением.
    """
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учётную запись")

    if hard:
        if auth.resolve_effective_role(current_user) != UserRole.OWNER:
            raise HTTPException(status_code=403, detail="Физическое удаление доступно только владельцу")
        hard_blockers = _detach_user_references(db, user_id)
        if hard_blockers:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Нельзя удалить: есть обязательные связи (" + "; ".join(hard_blockers) + "). "
                       "Переназначьте их на другого пользователя и повторите.",
            )
        try:
            db.delete(db_user)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Нельзя удалить: на пользователя ссылаются другие записи. "
                       "Сначала переназначьте или удалите связанные данные.",
            )
        log_action(db, current_user.id, "hard_delete", "user", user_id)
        return {"message": "User permanently deleted"}

    from app.models import Student, Group, Grade, Characteristic

    has_related = (
        db.query(Student).filter(Student.parent_id == user_id).count()
        or db.query(Group).filter(Group.trainer_id == user_id).count()
        or db.query(Grade).filter(Grade.trainer_id == user_id).count()
        or db.query(Characteristic).filter(Characteristic.trainer_id == user_id).count()
    )
    if has_related:
        db_user.is_active = False
        db.commit()
        log_action(db, current_user.id, "deactivate", "user", user_id)
        return {"message": "User deactivated (cannot delete due to related data)"}

    db.delete(db_user)
    db.commit()
    log_action(db, current_user.id, "delete", "user", user_id)
    return {"message": "User deleted"}
