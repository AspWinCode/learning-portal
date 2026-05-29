from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.common import UserRole


TRAINER_BANK_KEYS = ["alfa", "tinkoff", "sberbank", "vtb", "ozon"]
TrainerLessonFormat = Literal["group", "individual", "both"]


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str
    custom_role_id: Optional[int] = None
    phone: Optional[str] = None
    phone_extra: Optional[str] = None
    trainer_lesson_formats: Optional[TrainerLessonFormat] = None
    trainer_banks: Optional[List[str]] = None
    city: Optional[str] = None
    trainer_telegram: Optional[str] = None
    is_self_employed: Optional[bool] = None
    is_ip: Optional[bool] = None
    work_schedule: Optional[str] = None
    qualification: Optional[str] = None
    trainer_comment: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    custom_role_id: Optional[int] = None
    is_active: Optional[bool] = None
    trainer_rate: Optional[float] = None
    trainer_rate_per_hour: Optional[float] = None
    trainer_lessons: Optional[int] = None
    phone: Optional[str] = None
    phone_extra: Optional[str] = None
    trainer_lesson_formats: Optional[TrainerLessonFormat] = None
    trainer_banks: Optional[List[str]] = None
    city: Optional[str] = None
    trainer_telegram: Optional[str] = None
    is_self_employed: Optional[bool] = None
    is_ip: Optional[bool] = None
    work_schedule: Optional[str] = None
    qualification: Optional[str] = None
    trainer_comment: Optional[str] = None


class UserResponse(UserBase):
    id: int
    person_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    custom_role_id: Optional[int] = None
    custom_role_name: Optional[str] = None
    effective_role: Optional[UserRole] = None
    role_permissions: List[str] = Field(default_factory=list)
    trainer_rate: Optional[float] = None
    trainer_rate_per_hour: Optional[float] = None
    trainer_lessons: Optional[int] = None
    phone: Optional[str] = None
    phone_extra: Optional[str] = None
    trainer_lesson_formats: Optional[str] = None
    trainer_banks: Optional[List[str]] = None
    city: Optional[str] = None
    trainer_telegram: Optional[str] = None
    is_self_employed: Optional[bool] = None
    is_ip: Optional[bool] = None
    work_schedule: Optional[str] = None
    qualification: Optional[str] = None
    trainer_comment: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    total: int
    items: List[UserResponse]
    skip: int
    limit: int


__all__ = [name for name in globals() if not name.startswith("_")]
