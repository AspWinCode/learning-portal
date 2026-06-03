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
    is_game_jam: Optional[bool] = False


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
    is_game_jam: Optional[bool] = None


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
    is_game_jam: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CampaignDictionaryCreate(BaseModel):
    label: str


class CampaignDictionaryUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None
    position: Optional[int] = None


class CampaignDictionaryItemResponse(BaseModel):
    id: int
    category: str
    value: str
    label: str
    is_active: bool
    position: int

    model_config = ConfigDict(from_attributes=True)


class CampaignSettingsResponse(BaseModel):
    types: List[CampaignDictionaryItemResponse]
    formats: List[CampaignDictionaryItemResponse]
    scales: List[CampaignDictionaryItemResponse]
    cities: List[str]
    regions: List[str]


class CampaignStageCreate(BaseModel):
    label: str


class CampaignStageUpdate(BaseModel):
    label: Optional[str] = None
    position: Optional[int] = None
    is_terminal: Optional[bool] = None


class CampaignStageReorder(BaseModel):
    ordered_ids: List[int]


class CampaignStageResponse(BaseModel):
    id: int
    campaign_id: int
    key: str
    label: str
    position: int
    is_terminal: bool

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
    school_district: Optional[str] = None
    # Computed: most advanced active partnership step from B2BSchool.partnership
    partnership_step: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CampaignEventStageCreate(BaseModel):
    label: str


class CampaignEventStageUpdate(BaseModel):
    label: Optional[str] = None
    position: Optional[int] = None
    is_terminal: Optional[bool] = None


class CampaignEventStageReorder(BaseModel):
    ordered_ids: List[int]


class CampaignEventStageResponse(BaseModel):
    id: int
    campaign_event_id: int
    key: str
    label: str
    position: int
    is_terminal: bool

    model_config = ConfigDict(from_attributes=True)


class CampaignEventCreate(BaseModel):
    title: str
    event_date: date
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    trainer_id: Optional[int] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: Optional[str] = "planned"
    notes: Optional[str] = None
    host_b2b_school_id: Optional[int] = None


class CampaignEventUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[date] = None
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    trainer_id: Optional[int] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    host_b2b_school_id: Optional[int] = None


class CampaignEventResponse(BaseModel):
    id: int
    campaign_id: int
    title: str
    event_date: date
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    trainer_id: Optional[int] = None
    trainer_full_name: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None
    status: str
    notes: Optional[str] = None
    host_b2b_school_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SchoolCampaignEventUpdate(BaseModel):
    invite_status: Optional[str] = None
    participation_status: Optional[str] = None
    host_status: Optional[str] = None
    participant_count: Optional[int] = None
    jam_stage: Optional[str] = None
    notes: Optional[str] = None


class SchoolCampaignEventResponse(BaseModel):
    id: int
    campaign_event_id: int
    school_campaign_id: int
    invite_status: str
    participation_status: str
    participant_count: Optional[int] = None
    host_status: str
    jam_stage: Optional[str] = None
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
