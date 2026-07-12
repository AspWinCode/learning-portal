from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Folders ─────────────────────────────────────────────────────────────────

class NoteFolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[int] = None


class NoteFolderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    parent_id: Optional[int] = None


class NoteFolderResponse(BaseModel):
    id: int
    user_id: int
    name: str
    parent_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Notes ────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    title: str = Field(default="Без названия", max_length=512)
    content: Optional[str] = None
    folder_id: Optional[int] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=512)
    content: Optional[str] = None
    folder_id: Optional[int] = None


class NoteResponse(BaseModel):
    id: int
    user_id: int
    folder_id: Optional[int]
    title: str
    content: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Settings ─────────────────────────────────────────────────────────────────

class NotesEnabledRolesResponse(BaseModel):
    enabled_roles: list[str]


class NotesEnabledRolesUpdate(BaseModel):
    enabled_roles: list[str]
