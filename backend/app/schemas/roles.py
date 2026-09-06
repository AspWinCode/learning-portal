import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.permissions import VALID_PERMISSION_KEYS
from app.schemas.common import UserRole


ROLE_KEY_RE = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")


class RoleBase(BaseModel):
    key: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    base_role: UserRole
    permissions: List[str] = Field(default_factory=list)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not ROLE_KEY_RE.match(normalized):
            raise ValueError("Role key must contain lowercase latin letters, numbers, '_' or '-'")
        return normalized

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: List[str]) -> List[str]:
        seen = set()
        normalized: List[str] = []
        for item in value:
            candidate = item.strip()
            if not candidate or candidate in seen:
                continue
            if candidate not in VALID_PERMISSION_KEYS:
                raise ValueError(f"Unknown permission: {candidate}")
            seen.add(candidate)
            normalized.append(candidate)
        return normalized


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = None
    base_role: Optional[UserRole] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        seen = set()
        normalized: List[str] = []
        for item in value:
            candidate = item.strip()
            if not candidate or candidate in seen:
                continue
            if candidate not in VALID_PERMISSION_KEYS:
                raise ValueError(f"Unknown permission: {candidate}")
            seen.add(candidate)
            normalized.append(candidate)
        return normalized


class RoleResponse(RoleBase):
    id: int
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: List[str]) -> List[str]:  # noqa: F811
        # На выходе не отклоняем устаревшие/неизвестные ключи разрешений: иначе
        # удаление permission из каталога делает нечитаемыми уже сохранённые роли.
        seen = set()
        normalized: List[str] = []
        for item in value or []:
            candidate = str(item).strip()
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            normalized.append(candidate)
        return normalized


__all__ = [name for name in globals() if not name.startswith("_")]
