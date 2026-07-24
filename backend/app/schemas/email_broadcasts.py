from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class EmailBroadcastAttachmentResponse(BaseModel):
    id: int
    broadcast_id: int
    original_filename: str
    content_type: Optional[str] = None
    size_bytes: int = 0

    model_config = ConfigDict(from_attributes=True)


class EmailBroadcastCreate(BaseModel):
    name: str
    subject: str
    html_body: str
    plain_body: Optional[str] = None


class EmailBroadcastUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    html_body: Optional[str] = None
    plain_body: Optional[str] = None


class EmailBroadcastResponse(BaseModel):
    id: int
    name: str
    subject: str
    html_body: str
    plain_body: Optional[str] = None
    status: str
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    total_recipients: int = 0
    sent_count: int = 0
    failed_count: int = 0
    opened_count: int = 0
    clicked_count: int = 0
    attachments: List[EmailBroadcastAttachmentResponse] = []

    model_config = ConfigDict(from_attributes=True)


class SendBroadcastRequest(BaseModel):
    school_ids: List[int] = []
    limit: Optional[int] = None
    campaign_id: Optional[int] = None


class TestSendRequest(BaseModel):
    to_email: str


class EmailBroadcastRecipientResponse(BaseModel):
    id: int
    broadcast_id: int
    school_id: Optional[int] = None
    email: str
    school_name: Optional[str] = None
    director_name: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    open_count: int = 0
    clicked_at: Optional[datetime] = None
    click_count: int = 0
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RetryFailedRequest(BaseModel):
    pass
