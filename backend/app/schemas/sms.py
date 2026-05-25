from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel


class SmsSendRequest(BaseModel):
    phone: str
    message: str
    entity_type: Optional[Literal["lead", "event", "task"]] = None
    entity_id: Optional[int] = None
    send_at: Optional[datetime] = None


class SmsSendBulkRequest(BaseModel):
    phones: List[str]
    message: str


class SmsMessageResponse(BaseModel):
    id: str
    phone: str
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    status: str
    gateway_id: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    created_by: int

    class Config:
        from_attributes = True


class SmsTemplateResponse(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    event_key: Optional[str] = None
    channel: str
    subject: Optional[str] = None
    text: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


__all__ = [name for name in globals() if not name.startswith("_")]
