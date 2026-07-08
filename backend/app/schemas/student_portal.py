from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CourseCatalogItemKind(str, Enum):
    INTERNAL = "internal"
    EXTERNAL = "external"


class StudentCourseAccessStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"


class StudentLoginRequest(BaseModel):
    login: str
    password: str


class StudentProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class StudentLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    student: StudentProfileOut


class CourseProgressOut(BaseModel):
    """Последний снимок прогресса ученика во внешнем курсе."""
    model_config = ConfigDict(from_attributes=True)

    cases_solved: int = 0
    cases_total: int = 0
    rank_name: Optional[str] = None
    badges_count: int = 0
    last_badge_name: Optional[str] = None
    updated_at: Optional[datetime] = None


class CourseCatalogItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    kind: CourseCatalogItemKind
    has_access: bool = False
    progress: Optional[CourseProgressOut] = None


class CourseCatalogItemCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    kind: CourseCatalogItemKind = CourseCatalogItemKind.EXTERNAL
    external_url: Optional[str] = None
    sort_order: int = 0


class CourseCatalogItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    external_url: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CourseLaunchResponse(BaseModel):
    redirect_url: str


class StudentCredentialCreate(BaseModel):
    student_id: int
    login: str
    password: str


class StudentCredentialUpdate(BaseModel):
    login: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class StudentCredentialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    login: str
    is_active: bool
    last_login_at: Optional[datetime] = None


class GrantCourseAccessRequest(BaseModel):
    student_id: int
    catalog_item_id: int


class StudentCourseAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    catalog_item_id: int
    status: StudentCourseAccessStatus
    granted_at: Optional[datetime] = None


class StudentPortalAdminView(BaseModel):
    """Сводка по кабинету конкретного ученика — для карточки ученика в админке."""
    credential: Optional[StudentCredentialOut] = None
    access_grants: List[StudentCourseAccessOut] = []


class ProgressSyncRequest(BaseModel):
    """Тело запроса от сервера Кодэкс: прогресс одного ученика в одном курсе."""
    external_ref: str = Field(..., description="Идентификатор вида lp-student-{id}")
    catalog_item_code: str
    cases_solved: int = Field(0, ge=0)
    cases_total: int = Field(0, ge=0)
    rank_name: Optional[str] = None
    badges_count: int = Field(0, ge=0)
    last_badge_name: Optional[str] = None
