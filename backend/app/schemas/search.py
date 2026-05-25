from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.common import UserRole
from app.schemas.groups import GroupResponse
from app.schemas.students import StudentResponse
from app.schemas.users import UserResponse


class SearchResponse(BaseModel):
    students: List[StudentResponse] = []
    groups: List[GroupResponse] = []
    trainers: List[UserResponse] = []


class SearchRequest(BaseModel):
    q: str = Field(..., min_length=1)
    limit: int = Field(20, ge=1, le=100)


class LegacySearchRequest(BaseModel):
    query: str
    filters: Optional[dict] = None


class PhoneSearchUserItem(BaseModel):
    id: int
    person_id: Optional[int] = None
    full_name: str
    email: str
    role: UserRole
    phone: Optional[str] = None


class PhoneSearchLeadItem(BaseModel):
    id: int
    person_id: Optional[int] = None
    contact_name: str
    phone: str
    parent_full_name: Optional[str] = None
    child_full_name: Optional[str] = None
    student_card_id: Optional[int] = None
    converted_to_student_id: Optional[int] = None


class PhoneSearchStudentCardItem(BaseModel):
    id: int
    person_id: Optional[int] = None
    student_full_name: str
    parent_full_name: Optional[str] = None
    parent_phone: Optional[str] = None
    student_phone: Optional[str] = None
    student_id: Optional[int] = None


class PhoneSearchResponse(BaseModel):
    normalized_phone: str
    users: List[PhoneSearchUserItem] = []
    leads: List[PhoneSearchLeadItem] = []
    student_cards: List[PhoneSearchStudentCardItem] = []


class PersonLinkedRecordResponse(BaseModel):
    entity_type: Literal["user", "lead", "student_card"]
    entity_id: int
    label: str


class PersonSearchItemResponse(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    phone_normalized: Optional[str] = None
    role_hint: Optional[str] = None
    linked_records: List[PersonLinkedRecordResponse] = Field(default_factory=list)


class PersonSearchResponse(BaseModel):
    query: str
    items: List[PersonSearchItemResponse] = Field(default_factory=list)


class PersonMergeRequest(BaseModel):
    source_person_id: int
    target_person_id: int


class PersonAttachRecordRequest(BaseModel):
    person_id: int
    entity_type: Literal["user", "lead", "student_card"]
    entity_id: int


__all__ = [name for name in globals() if not name.startswith("_")]
