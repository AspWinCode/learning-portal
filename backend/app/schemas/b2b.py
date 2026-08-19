from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class B2BSchoolPipelineStage(str, Enum):
    NEW = "new"
    FIND_CONTACTS = "find_contacts"
    FIRST_CONTACT = "first_contact"
    CONTACT_FOUND = "contact_found"
    LETTER_SENT = "letter_sent"
    MEETING_SCHEDULED = "meeting_scheduled"
    AGREEMENT = "agreement"
    MEETING_HELD = "meeting_held"
    PERMISSION_RECEIVED = "permission_received"
    EVENT_SCHEDULED = "event_scheduled"
    WALKTHROUGH_SCHEDULED = "walkthrough_scheduled"
    EVENT_DONE = "event_done"
    WALKTHROUGH_DONE = "walkthrough_done"
    LEADS_RECEIVED = "leads_received"
    THANK_YOU = "thank_you"
    SUPPORT_LETTER_REQUESTED = "support_letter_requested"
    SUPPORT_LETTER_RECEIVED = "support_letter_received"
    PARTNERS = "partners"
    REJECTED = "rejected"


class B2BSchoolFriendshipDegree(str, Enum):
    UNKNOWN = "unknown"
    INDIRECT = "indirect"
    FRIENDS = "friends"
    ENEMIES = "enemies"


class B2BSchoolContactCreate(BaseModel):
    full_name: str
    position: Optional[str] = None
    phone: str
    phone_extra: Optional[str] = None


class B2BSchoolContactUpdate(BaseModel):
    full_name: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    phone_extra: Optional[str] = None


class B2BSchoolContactResponse(BaseModel):
    id: int
    b2b_school_id: int
    full_name: str
    position: Optional[str] = None
    phone: str
    phone_extra: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class B2BSchoolCreate(BaseModel):
    name: str
    director: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[B2BSchoolFriendshipDegree] = None
    pipeline_stage: B2BSchoolPipelineStage = B2BSchoolPipelineStage.NEW
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    phone_school: Optional[str] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None
    comment: Optional[str] = None
    custom_fields: Optional[List[Dict[str, Any]]] = None
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None


class B2BSchoolUpdate(BaseModel):
    name: Optional[str] = None
    director: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[B2BSchoolFriendshipDegree] = None
    pipeline_stage: Optional[B2BSchoolPipelineStage] = None
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    phone_school: Optional[str] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None
    support_letter_status: Optional[str] = None
    partnership: Optional[Dict[str, Any]] = None
    comment: Optional[str] = None
    custom_fields: Optional[List[Dict[str, Any]]] = None
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None


class B2BSchoolResponse(BaseModel):
    id: int
    name: str
    director: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    student_count: Optional[int] = None
    friendship_degree: Optional[str] = None
    pipeline_stage: str
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None
    manager_id: Optional[int] = None
    manager_full_name: Optional[str] = None
    phone_school: Optional[str] = None
    source: Optional[str] = None
    priority: Optional[str] = None
    preference: Optional[str] = None
    support_letter_status: Optional[str] = None
    partnership: Optional[Dict[str, Any]] = None
    comment: Optional[str] = None
    custom_fields: Optional[List[Dict[str, Any]]] = None
    event_dates: Optional[List[str]] = None
    meeting_scheduled_at: Optional[datetime] = None
    meeting_outcomes: Optional[str] = None
    walkthrough_scheduled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    leads_count: Optional[int] = None
    conversion_percent: Optional[float] = None
    contacts: Optional[List[B2BSchoolContactResponse]] = None

    model_config = ConfigDict(from_attributes=True)


class B2BLeadListItem(BaseModel):
    id: int
    contact_name: str
    phone: str
    status: str
    source: Optional[str] = None
    source_event: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class B2BSchoolInteractionCreate(BaseModel):
    type: str
    happened_at: datetime
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_date: Optional[date] = None


class B2BSchoolInteractionResponse(BaseModel):
    id: int
    b2b_school_id: int
    type: str
    happened_at: datetime
    summary: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class B2BSchoolEventCreate(BaseModel):
    format: str
    online_type: Optional[str] = None
    dates: Optional[List[str]] = None


class B2BSchoolEventResponse(BaseModel):
    id: int
    b2b_school_id: int
    format: str
    online_type: Optional[str] = None
    event_dates: Optional[List[str]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class B2BSchoolImportResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str] = []


class B2BProjectBase(BaseModel):
    name: str
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None


class B2BProjectCreate(B2BProjectBase):
    pass


class B2BProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None
    archived: Optional[bool] = None


class B2BProjectResponse(BaseModel):
    id: int
    name: str
    location: Optional[str] = None
    main_city: Optional[str] = None
    cities: Optional[List[str]] = None
    archived: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class B2BDocumentResponse(BaseModel):
    id: int
    b2b_school_id: int
    type: str
    file_name: str
    file_size_kb: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_by_id: int
    uploaded_by_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class B2BPartnershipUpdate(BaseModel):
    step: str
    value: bool


class CitySummaryItem(BaseModel):
    city: str
    schools_in_work: int
    overdue: int
    events_this_week: int
    leads_7d: int
    partners: int


__all__ = [name for name in globals() if not name.startswith("_")]
