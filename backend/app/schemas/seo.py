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


class SiteSettingsResponse(BaseModel):
    site_title: Optional[str] = None
    site_description: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    vk_url: Optional[str] = None
    tg_url: Optional[str] = None
    inst_url: Optional[str] = None
    ga_measurement_id: Optional[str] = None
    ym_counter_id: Optional[str] = None
    vk_pixel_id: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SiteSettingsUpdate(BaseModel):
    site_title: Optional[str] = Field(default=None, max_length=255)
    site_description: Optional[str] = None
    contact_phone: Optional[str] = Field(default=None, max_length=100)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    vk_url: Optional[str] = Field(default=None, max_length=500)
    tg_url: Optional[str] = Field(default=None, max_length=500)
    inst_url: Optional[str] = Field(default=None, max_length=500)
    ga_measurement_id: Optional[str] = Field(default=None, max_length=50)
    ym_counter_id: Optional[str] = Field(default=None, max_length=20)
    vk_pixel_id: Optional[str] = Field(default=None, max_length=100)


class SeoRedirectBase(BaseModel):
    from_path: str = Field(max_length=500)
    to_url: str = Field(max_length=500)
    status_code: int = Field(default=301)
    is_active: bool = True


class SeoRedirectCreate(SeoRedirectBase):
    pass


class SeoRedirectUpdate(BaseModel):
    to_url: Optional[str] = Field(default=None, max_length=500)
    status_code: Optional[int] = None
    is_active: Optional[bool] = None


class SeoRedirectResponse(SeoRedirectBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
