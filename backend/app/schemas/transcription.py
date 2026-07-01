from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    id: int
    filename: str
    content_type: Optional[str] = None
    size_bytes: int = 0
    status: Literal["pending", "processing", "done", "error"]
    language: Optional[str] = None
    text: Optional[str] = None
    error_message: Optional[str] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TranscriptionsListResponse(BaseModel):
    items: List[TranscriptionResponse]
