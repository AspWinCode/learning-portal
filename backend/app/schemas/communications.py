from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.sms import SmsTemplateResponse


class CommunicationTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    category: Optional[str] = Field(None, max_length=64)
    event_key: Optional[str] = Field(None, max_length=128)
    channel: Literal["sms", "email", "max", "telegram", "web_push"]
    subject: Optional[str] = Field(None, max_length=255)
    text: str = Field(..., min_length=1)
    active: bool = True


class CommunicationTemplateCreate(CommunicationTemplateBase):
    pass


class CommunicationTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    category: Optional[str] = Field(None, max_length=64)
    event_key: Optional[str] = Field(None, max_length=128)
    channel: Optional[Literal["sms", "email", "max", "telegram", "web_push"]] = None
    subject: Optional[str] = Field(None, max_length=255)
    text: Optional[str] = Field(None, min_length=1)
    active: Optional[bool] = None


class CommunicationQueueResponse(BaseModel):
    id: str
    recipient_type: str
    recipient_id: int
    channel: str
    template_id: Optional[int] = None
    template_name: Optional[str] = None
    status: str
    attempt_count: int
    last_attempt_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    error: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    dedupe_key: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MaxSendRequest(BaseModel):
    lead_id: Optional[int] = None
    max_user_id: Optional[int] = None
    phone: Optional[str] = None
    message: str
    send_at: Optional[datetime] = None


class MaxSendResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


__all__ = [name for name in globals() if not name.startswith("_")]
