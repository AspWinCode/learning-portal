from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field



class CommunicationTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    category: Optional[str] = Field(None, max_length=64)
    event_key: Optional[str] = Field(None, max_length=128)
    channel: Literal["sms", "email", "max", "web_push"]
    subject: Optional[str] = Field(None, max_length=255)
    text: str = Field(..., min_length=1)
    active: bool = True


class CommunicationTemplateCreate(CommunicationTemplateBase):
    pass


class CommunicationTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    category: Optional[str] = Field(None, max_length=64)
    event_key: Optional[str] = Field(None, max_length=128)
    channel: Optional[Literal["sms", "email", "max", "web_push"]] = None
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

    model_config = ConfigDict(from_attributes=True)


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


class MaxGroupConnectRequest(BaseModel):
    chat_id: str = Field(..., min_length=1, max_length=64)


class MaxGroupLinkResponse(BaseModel):
    group_id: int
    chat_id: str
    chat_title: Optional[str] = None
    connected: bool
    is_active: bool = True
    last_verified_at: Optional[datetime] = None
    verification_status: Optional[str] = None


class MaxGroupSendRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class MaxBroadcastCreateRequest(BaseModel):
    scope: Literal["active_groups", "selected_groups"] = "active_groups"
    group_ids: Optional[list[int]] = None
    text: str = Field(..., min_length=1, max_length=4000)


class MaxBroadcastTargetResponse(BaseModel):
    id: int
    group_id: int
    chat_title: Optional[str] = None
    status: str
    attempts: int
    last_error: Optional[str] = None
    sent_at: Optional[datetime] = None


class MaxBroadcastResponse(BaseModel):
    id: int
    status: str
    text: str
    total_targets: int
    success_count: int
    failed_count: int
    created_at: datetime
    targets: list[MaxBroadcastTargetResponse] = []


__all__ = [name for name in globals() if not name.startswith("_")]
