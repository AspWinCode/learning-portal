from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class DiskItemResponse(BaseModel):
    id: int
    name: str
    item_type: Literal["folder", "file"]
    parent_id: Optional[int] = None
    content_type: Optional[str] = None
    size_bytes: int = 0
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DiskItemsResponse(BaseModel):
    items: List[DiskItemResponse]
    breadcrumbs: List[DiskItemResponse] = Field(default_factory=list)


class DiskFolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[int] = None


class DiskItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    parent_id: Optional[int] = None


class DiskAccessGrantCreate(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = Field(None, max_length=32)


class DiskAccessGrantResponse(BaseModel):
    id: int
    folder_id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    role: Optional[str] = None
    can_view: bool = True
    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
