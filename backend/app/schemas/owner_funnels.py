from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class OwnerFunnelTypeInfo(BaseModel):
    id: str
    label: str
    stages: List[dict]


class OwnerFunnelEventCreate(BaseModel):
    event_name: str
    event_dates: Optional[str] = None


class OwnerFunnelEventResponse(BaseModel):
    id: int
    event_name: str
    event_dates: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OwnerFunnelItemCreate(BaseModel):
    funnel_type: str
    stage: str = "new"
    title: Optional[str] = None
    comment: Optional[str] = None
    event_id: Optional[int] = None
    card_data: Optional[dict] = None


class OwnerFunnelItemUpdate(BaseModel):
    stage: Optional[str] = None
    title: Optional[str] = None
    comment: Optional[str] = None
    card_data: Optional[dict] = None
    contact_fio: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_comment: Optional[str] = None
    reply_comment: Optional[str] = None
    meeting_date: Optional[str] = None
    trip_date: Optional[str] = None
    leads_count: Optional[int] = None


class OwnerFunnelItemResponse(BaseModel):
    id: int
    funnel_type: str
    event_id: Optional[int] = None
    stage: str
    title: Optional[str] = None
    comment: Optional[str] = None
    card_data: Optional[dict] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AddSchoolsByCityPayload(BaseModel):
    city: str


__all__ = [name for name in globals() if not name.startswith("_")]
