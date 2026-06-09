from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PasswordEntryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    website_url: Optional[str] = Field(None, max_length=2048)
    login: Optional[str] = Field(None, max_length=255)
    note: Optional[str] = None


class PasswordEntryCreate(PasswordEntryBase):
    password: str = Field(..., min_length=1, max_length=4096)


class PasswordEntryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    website_url: Optional[str] = Field(None, max_length=2048)
    login: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, min_length=1, max_length=4096)
    note: Optional[str] = None


class PasswordEntryResponse(PasswordEntryBase):
    id: int
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    has_password: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PasswordSecretResponse(BaseModel):
    id: int
    password: str

