from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(default="Без названия", max_length=512)
    content: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=512)
    content: Optional[str] = None


class NoteResponse(BaseModel):
    id: int
    user_id: int
    title: str
    content: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class NotesEnabledRolesResponse(BaseModel):
    enabled_roles: list[str]


class NotesEnabledRolesUpdate(BaseModel):
    enabled_roles: list[str]
