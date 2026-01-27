from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    OWNER = "owner"
    TRAINER = "trainer"
    PARENT = "parent"
    GUEST = "guest"


class StudentStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacteristicStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordReset(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str


# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Student schemas
class StudentBase(BaseModel):
    full_name: str


class StudentCreate(StudentBase):
    parent_id: Optional[int] = None


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    parent_id: Optional[int] = None
    status: Optional[StudentStatus] = None


class StudentResponse(StudentBase):
    id: int
    parent_id: Optional[int] = None
    status: StudentStatus
    created_at: datetime
    parent: Optional[UserResponse] = None
    programs: Optional[List["ProgramSummaryResponse"]] = []

    class Config:
        from_attributes = True


# Group schemas
class GroupBase(BaseModel):
    name: str


class GroupCreate(GroupBase):
    trainer_id: int
    student_ids: Optional[List[int]] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    trainer_id: Optional[int] = None
    status: Optional[str] = None


class GroupResponse(GroupBase):
    id: int
    trainer_id: int
    status: str
    created_at: datetime
    trainer: Optional[UserResponse] = None
    students: Optional[List[StudentResponse]] = []
    programs: Optional[List["ProgramSummaryResponse"]] = []

    class Config:
        from_attributes = True


# Program schemas
class ProgramSummaryResponse(BaseModel):
    id: int
    name: str
    version: int
    status: str

    class Config:
        from_attributes = True

class TopicBase(BaseModel):
    name: str
    description: Optional[str] = None
    final_result: Optional[str] = None
    order: int = 0


class TopicCreate(TopicBase):
    pass


class TopicResponse(TopicBase):
    id: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ModuleBase(BaseModel):
    name: str
    order: int = 0


class ModuleCreate(ModuleBase):
    topics: List[TopicCreate] = []


class ModuleResponse(ModuleBase):
    id: int
    status: str
    topics: List[TopicResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ProgramBase(BaseModel):
    name: str


class ProgramCreate(ProgramBase):
    modules: List[ModuleCreate] = []
    trainer_ids: Optional[List[int]] = []


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    modules: Optional[List[ModuleCreate]] = None


class ProgramResponse(ProgramBase):
    id: int
    version: int
    parent_program_id: Optional[int] = None
    status: str
    created_at: datetime
    modules: List[ModuleResponse] = []

    class Config:
        from_attributes = True


# Grade schemas
class GradeBase(BaseModel):
    grade: float = Field(..., ge=0, le=5)
    comment: Optional[str] = None
    date: datetime


class GradeCreate(GradeBase):
    student_id: int
    topic_id: int


class GradeUpdate(BaseModel):
    grade: Optional[float] = Field(None, ge=0, le=5)
    comment: Optional[str] = None
    date: Optional[datetime] = None


class GradeResponse(GradeBase):
    id: int
    student_id: int
    topic_id: int
    trainer_id: int
    created_at: datetime
    student: Optional[StudentResponse] = None
    topic: Optional[TopicResponse] = None
    trainer: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# Characteristic schemas
class CharacteristicField(BaseModel):
    name: str
    label: str
    type: str  # text, number, select, etc.
    required: bool = False
    options: Optional[List[str]] = None


class CharacteristicTemplateCreate(BaseModel):
    name: str
    fields: List[CharacteristicField]


class CharacteristicTemplateResponse(BaseModel):
    id: int
    name: str
    fields: List[CharacteristicField]
    is_active: bool

    class Config:
        from_attributes = True


class CharacteristicCreate(BaseModel):
    student_id: int
    month: int = Field(..., ge=1, le=12)
    year: int
    data: Dict[str, Any]


class CharacteristicUpdate(BaseModel):
    data: Optional[Dict[str, Any]] = None
    status: Optional[CharacteristicStatus] = None


class CharacteristicApprove(BaseModel):
    comment: Optional[str] = None


class CharacteristicReject(BaseModel):
    comment: str


class CharacteristicResponse(BaseModel):
    id: int
    student_id: int
    trainer_id: int
    month: int
    year: int
    data: Dict[str, Any]
    status: CharacteristicStatus
    admin_comment: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None
    student: Optional[StudentResponse] = None
    trainer: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# Search and filter schemas
class SearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    students: List[StudentResponse] = []
    groups: List[GroupResponse] = []
    trainers: List[UserResponse] = []


# Settings schemas
class LogoResponse(BaseModel):
    data_url: Optional[str] = None


class LogoUpdate(BaseModel):
    data_url: str


# Report schemas
class ReportRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    student_ids: Optional[List[int]] = None
    trainer_ids: Optional[List[int]] = None
    format: str = "xlsx"  # xlsx or csv

