from datetime import datetime, timedelta
from typing import Dict, Optional, Set
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UserRole
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

DEFAULT_ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    UserRole.ADMIN.value: {"*"},
    UserRole.OWNER.value: {"*"},
    UserRole.SALES.value: {"sales.access", "finance.access", "tasks.access", "projects.access", "owner_workspace.access", "students.access", "students.manage", "lessons.access", "lessons.manage", "lessons.schedule_manage", "student_accounts.access", "student_accounts.manage", "student_accounts.payment"},
    UserRole.TRAINER.value: {"tasks.access", "projects.access", "owner_workspace.access", "groups.access", "programs.access", "students.access", "grades.access", "grades.manage", "characteristics.access", "characteristics.manage", "lessons.access", "lessons.manage", "telegram.link"},
    UserRole.PARENT.value: {"programs.access", "groups.access", "grades.access", "characteristics.access", "student_accounts.access", "student_accounts.payment", "telegram.link"},
    UserRole.GUEST.value: {"programs.access"},
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Попробуем через passlib
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Если не работает, используем прямой bcrypt (для совместимости)
        import bcrypt
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception:
            return False


def get_password_hash(password: str) -> str:
    """Хеширование пароля с использованием bcrypt напрямую для совместимости"""
    import bcrypt
    # Обрезаем пароль до 72 байт (ограничение bcrypt)
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    # Генерируем соль и хешируем
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role") or ""
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Guest tokens are not tied to a DB user
    if role == UserRole.GUEST.value:
        guest = User(
            id=0,
            email="guest",
            full_name="Гость",
            role=UserRole.GUEST,
            is_active=True,
            created_at=datetime.utcnow(),
        )
        return guest

    user = get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def resolve_effective_role(user: User) -> UserRole:
    custom_role = getattr(user, "custom_role", None)
    if custom_role and getattr(custom_role, "is_active", False):
        base_role = getattr(custom_role, "base_role", None)
        if isinstance(base_role, UserRole):
            return base_role
        if isinstance(base_role, str):
            return UserRole(base_role)
    if isinstance(user.role, UserRole):
        return user.role
    return UserRole(user.role)


def _normalize_permission_values(values: Optional[list]) -> Set[str]:
    normalized: Set[str] = set()
    for raw in values or []:
        permission = str(raw or "").strip()
        if permission:
            normalized.add(permission)
    return normalized


def get_user_permissions(user: User) -> Set[str]:
    effective_role = resolve_effective_role(user)
    default_permissions = set(DEFAULT_ROLE_PERMISSIONS.get(effective_role.value, set()))
    explicit_permissions = _normalize_permission_values(getattr(user, "role_permissions", []))
    custom_role = getattr(user, "custom_role", None)

    if custom_role and getattr(custom_role, "is_active", False):
        return explicit_permissions or default_permissions

    return default_permissions | explicit_permissions


def has_permission(user: User, permission: str) -> bool:
    normalized_permission = str(permission or "").strip()
    if not normalized_permission:
        return False

    permissions = get_user_permissions(user)
    if "*" in permissions or normalized_permission in permissions:
        return True

    parts = normalized_permission.split(".")
    for index in range(len(parts) - 1, 0, -1):
        wildcard_permission = ".".join(parts[:index]) + ".*"
        if wildcard_permission in permissions:
            return True
    return False


def ensure_permission(user: User, permission: str) -> None:
    if not has_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )


def require_role(allowed_roles: list):
    """Dependency для проверки роли пользователя"""
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        effective_roles = set(allowed_roles)
        if "admin" in effective_roles:
            effective_roles.add("owner")
        effective_role = resolve_effective_role(current_user)
        if effective_role.value not in effective_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        if effective_role == UserRole.SALES and "sales" in effective_roles:
            ensure_permission(current_user, "sales.access")
        return current_user
    return role_checker


def require_permission(permission: str):
    """Dependency for permission-based access checks."""

    async def permission_checker(current_user: User = Depends(get_current_active_user)):
        ensure_permission(current_user, permission)
        return current_user

    return permission_checker

