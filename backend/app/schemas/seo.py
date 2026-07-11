from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import SeoPageStatus


class SeoPageBase(BaseModel):
    title: str = Field(max_length=255)
    slug: str = Field(max_length=255)
    h1: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = None
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    canonical: Optional[str] = Field(default=None, max_length=500)
    robots: Optional[str] = Field(default=None, max_length=100)
    og_title: Optional[str] = Field(default=None, max_length=255)
    og_description: Optional[str] = Field(default=None, max_length=500)
    og_image: Optional[str] = Field(default=None, max_length=500)


class SeoPageCreate(SeoPageBase):
    status: SeoPageStatus = SeoPageStatus.DRAFT


class SeoPageUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    slug: Optional[str] = Field(default=None, max_length=255)
    status: Optional[SeoPageStatus] = None
    h1: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = None
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    canonical: Optional[str] = Field(default=None, max_length=500)
    robots: Optional[str] = Field(default=None, max_length=100)
    og_title: Optional[str] = Field(default=None, max_length=255)
    og_description: Optional[str] = Field(default=None, max_length=500)
    og_image: Optional[str] = Field(default=None, max_length=500)


class SeoPageResponse(SeoPageBase):
    id: int
    status: SeoPageStatus
    author_id: Optional[int]
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SeoPageListResponse(BaseModel):
    total: int
    items: List[SeoPageResponse]
