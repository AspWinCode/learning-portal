import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Set
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from redis import Redis
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole

load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
if len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must be at least 32 characters")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
GUEST_TOKEN_EXPIRE_HOURS = int(os.getenv("GUEST_TOKEN_EXPIRE_HOURS", "24"))
GUEST_USER_ID = -1
STUDENT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("STUDENT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
STUDENT_TOKEN_TYPE = "student_portal"
REDIS_URL = (os.getenv("REDIS_URL") or "redis://redis:6379/0").strip()
TOKEN_BLACKLIST_PREFIX = "auth:blacklist:jti:"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")
_redis_client: Optional[Redis] = None

DEFAULT_ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    UserRole.ADMIN.value: {"*"},
    UserRole.OWNER.value: {"*"},
    UserRole.SALES.value: {
        "sales.access",
        "sales.manage_leads",
        "sales.manage_events",
        "sales.manage_invoices",
        "sales.manage_student_cards",
        "sales.manage_bank",
        "finance.access",
        "finance.manage",
        "communications.access",
        "communications.manage",
        "tasks.access",
        "projects.access",
        "owner_workspace.access",
        "students.access",
        "students.manage",
        "lessons.access",
        "lessons.manage",
        "lessons.schedule_manage",
        "student_accounts.access",
        "student_accounts.manage",
        "student_accounts.payment",
        "persons.access",
        "persons.manage",
    },
    UserRole.TRAINER.value: {
        "tasks.access",
        "projects.access",
        "owner_workspace.access",
        "groups.access",
        "programs.access",
        "students.access",
        "grades.access",
        "grades.manage",
        "characteristics.access",
        "characteristics.manage",
        "lessons.access",
        "lessons.manage",
        "telegram.link",
        "trainer_cockpit.access",
        "student_portal.manage",
        "technolab.access",
        "pixelforge.access",
    },
    UserRole.PARENT.value: {
        "programs.access",
        "groups.access",
        "grades.access",
        "characteristics.access",
        "student_accounts.access",
        "student_accounts.payment",
        "telegram.link",
        "parent_dashboard.access",
    },
    UserRole.GUEST.value: {"programs.access"},
    UserRole.SEO_MANAGER.value: {
        "seo.access",
        "seo.manage",
    },
    UserRole.METHODIST.value: {
        "kodex.access",
        "kodex.manage",
        "technolab.access",
        "technolab.manage",
        "pixelforge.access",
        "pixelforge.manage",
    },
    UserRole.DEVELOPER.value: {
        "agile.access",
        "agile.manage",
        "tasks.access",
        "projects.access",
        "owner_workspace.access",
    },
    UserRole.MANAGER.value: {
        "students.access",
        "student_portal.manage",
    },
}

# Роли с постоянным agile-доступом (admin/owner имеют '*', поэтому не нужны здесь явно)
AGILE_ALWAYS_ACCESS_ROLES = {UserRole.OWNER.value, UserRole.ADMIN.value}


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _blacklist_key(jti: str) -> str:
    return f"{TOKEN_BLACKLIST_PREFIX}{jti}"


def add_token_to_blacklist(jti: str, ttl_seconds: int) -> None:
    normalized_jti = str(jti or "").strip()
    if not normalized_jti or ttl_seconds <= 0:
        return
    get_redis_client().setex(_blacklist_key(normalized_jti), int(ttl_seconds), "1")


def is_token_blacklisted(jti: str) -> bool:
    normalized_jti = str(jti or "").strip()
    if not normalized_jti:
        return False
    try:
        return bool(get_redis_client().exists(_blacklist_key(normalized_jti)))
    except Exception:
        # Redis unavailable — treat token as not blacklisted
        return False


def validate_password_strength(password: str) -> None:
    value = str(password or "")
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long and contain at least one letter and one digit")
    if not any(char.isalpha() for char in value):
        raise ValueError("Password must contain at least one letter")
    if not any(char.isdigit() for char in value):
        raise ValueError("Password must contain at least one digit")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        import bcrypt

        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False


def get_password_hash(password: str) -> str:
    import bcrypt

    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.setdefault("jti", str(uuid4()))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_token_ttl_seconds(payload: dict) -> int:
    exp = payload.get("exp")
    if exp is None:
        return 0
    if isinstance(exp, datetime):
        expire_at = exp if exp.tzinfo is not None else exp.replace(tzinfo=timezone.utc)
    else:
        expire_at = datetime.fromtimestamp(float(exp), tz=timezone.utc)
    ttl = int((expire_at - datetime.now(timezone.utc)).total_seconds())
    return max(ttl, 0)


def blacklist_token(token: str) -> None:
    payload = decode_access_token(token)
    jti = str(payload.get("jti") or "").strip()
    if not jti:
        return
    add_token_to_blacklist(jti, get_token_ttl_seconds(payload))


student_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/student-portal/auth/login", auto_error=False)


def create_student_access_token(student_id: int, login: str) -> str:
    """Отдельный JWT-скоуп для кабинета ученика — не пересекается с токенами User."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=STUDENT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": login,
        "student_id": student_id,
        "type": STUDENT_TOKEN_TYPE,
        "jti": str(uuid4()),
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_student(
    token: Optional[str] = Depends(student_oauth2_scheme),
    db: Session = Depends(get_db),
):
    from app.models import Student, StudentCredential

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate student credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = decode_access_token(token)
        if payload.get("type") != STUDENT_TOKEN_TYPE:
            raise credentials_exception
        student_id = payload.get("student_id")
        jti = str(payload.get("jti") or "").strip()
        if student_id is None or not jti or is_token_blacklisted(jti):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    student = db.query(Student).filter(Student.id == int(student_id)).first()
    if student is None:
        raise credentials_exception
    credential = db.query(StudentCredential).filter(StudentCredential.student_id == student.id).first()
    if credential is None or not credential.is_active:
        raise credentials_exception
    return student


def ensure_persisted_user_id(user_id: int) -> int:
    if int(user_id) == GUEST_USER_ID:
        raise PermissionError("Guest user cannot be used in database user_id queries")
    return int(user_id)


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
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        role = payload.get("role") or ""
        jti = str(payload.get("jti") or "").strip()
        if email is None or not jti or is_token_blacklisted(jti):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if role == UserRole.GUEST.value:
        return User(
            id=GUEST_USER_ID,
            email="guest@example.com",
            full_name="Гость",
            role=UserRole.GUEST,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )

    user = get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
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

    # Collect permissions from extra base roles
    extra_roles = getattr(user, "extra_roles", None) or []
    extra_permissions: Set[str] = set()
    for extra_role in extra_roles:
        extra_permissions |= set(DEFAULT_ROLE_PERMISSIONS.get(str(extra_role), set()))

    if custom_role and getattr(custom_role, "is_active", False):
        base = explicit_permissions or default_permissions
        return base | extra_permissions

    return default_permissions | explicit_permissions | extra_permissions


def has_permission(user: User, permission: str) -> bool:
    normalized_permission = str(permission or "").strip()
    if not normalized_permission:
        return False

    permissions = get_user_permissions(user)
    if "*" in permissions or normalized_permission in permissions:
        return True

    if normalized_permission.endswith(".access"):
        manage_permission = normalized_permission[: -len(".access")] + ".manage"
        if manage_permission in permissions:
            return True
    elif not normalized_permission.endswith(".manage"):
        # Более мелкое право вида "<module>.<action>" (например "students.delete")
        # считается включённым в широкое "<module>.manage" — так разбивка module.manage
        # на отдельные действия не отбирает доступ у ролей, у которых уже стоит .manage.
        module = normalized_permission.split(".", 1)[0]
        if f"{module}.manage" in permissions:
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
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        effective_roles = set(allowed_roles)
        if "admin" in effective_roles:
            effective_roles.add("owner")
        effective_role = resolve_effective_role(current_user)
        if effective_role.value not in effective_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
            )
        if effective_role == UserRole.SALES and "sales" in effective_roles:
            ensure_permission(current_user, "sales.access")
        return current_user

    return role_checker


def require_permission(permission: str):
    async def permission_checker(current_user: User = Depends(get_current_active_user)):
        ensure_permission(current_user, permission)
        return current_user

    return permission_checker


def require_any_permission(*permissions: str):
    """Пропускает, если у пользователя есть хотя бы одно из перечисленных прав —
    для ресурсов, общих для нескольких модулей (например загрузка медиа)."""
    async def permission_checker(current_user: User = Depends(get_current_active_user)):
        if not any(has_permission(current_user, p) for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
            )
        return current_user

    return permission_checker
