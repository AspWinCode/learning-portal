from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class CampaignBase(BaseModel):
    name: str
    type: str
    format: str
    city: Optional[str] = None
    region: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    responsible_id: Optional[int] = None
    status: Optional[str] = "draft"
    mode: Optional[str] = "city"


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    format: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    responsible_id: Optional[int] = None
    status: Optional[str] = None
    mode: Optional[str] = None


class CampaignResponse(BaseModel):
    id: int
    name: str
    type: str
    format: str
    city: Optional[str] = None
    region: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    responsible_id: Optional[int] = None
    responsible_full_name: Optional[str] = None
    status: str
    mode: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SchoolCampaignBase(BaseModel):
    stage: Optional[str] = "not_contacted"
    support_letter_status: Optional[str] = None
    thank_you_sent: Optional[bool] = False


class SchoolCampaignCreate(BaseModel):
    b2b_school_id: int
    campaign_id: int
    stage: Optional[str] = "not_contacted"


class SchoolCampaignUpdate(BaseModel):
    stage: Optional[str] = None
    support_letter_status: Optional[str] = None
    thank_you_sent: Optional[bool] = None


class SchoolCampaignResponse(BaseModel):
    id: int
    b2b_school_id: int
    campaign_id: int
    stage: str
    support_letter_status: Optional[str] = None
    thank_you_sent: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    school_name: Optional[str] = None
    school_city: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CampaignEventCreate(BaseModel):
    title: str
    event_date: date
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: Optional[str] = "planned"
    notes: Optional[str] = None


class CampaignEventUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[date] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class CampaignEventResponse(BaseModel):
    id: int
    campaign_id: int
    title: str
    event_date: date
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SchoolCampaignEventUpdate(BaseModel):
    invite_status: Optional[str] = None
    participation_status: Optional[str] = None
    host_status: Optional[str] = None
    participant_count: Optional[int] = None
    notes: Optional[str] = None


class SchoolCampaignEventResponse(BaseModel):
    id: int
    campaign_event_id: int
    school_campaign_id: int
    invite_status: str
    participation_status: str
    participant_count: Optional[int] = None
    host_status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SchoolCampaignEventBulkUpdate(BaseModel):
    school_campaign_ids: List[int]
    invite_status: Optional[str] = None
    participation_status: Optional[str] = None
    host_status: Optional[str] = None
    create_invite_tasks: bool = False
    create_host_tasks: bool = False
    create_participated_tasks: bool = False


class AddSchoolsBody(BaseModel):
    school_ids: List[int]
    create_contact_task: bool = True


class SchoolsEventsMatrixResponse(BaseModel):
    schools: List[Dict[str, Any]]
    events: List[CampaignEventResponse]
    school_campaign_events: List[SchoolCampaignEventResponse]


__all__ = [name for name in globals() if not name.startswith("_")]
