from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class BlogPostStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


# ─── Category ───────────────────────────────────────────────────────────────

class BlogCategoryBase(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = None


class BlogCategoryCreate(BlogCategoryBase):
    pass


class BlogCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = None


class BlogCategoryResponse(BlogCategoryBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Tag ────────────────────────────────────────────────────────────────────

class BlogTagBase(BaseModel):
    name: str = Field(..., max_length=100)
    slug: str = Field(..., max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class BlogTagCreate(BlogTagBase):
    pass


class BlogTagUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    slug: Optional[str] = Field(None, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class BlogTagResponse(BlogTagBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Post ───────────────────────────────────────────────────────────────────

class BlogPostBase(BaseModel):
    title: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    excerpt: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    cover_image: Optional[str] = Field(None, max_length=500)
    seo_title: Optional[str] = Field(None, max_length=255)
    seo_description: Optional[str] = Field(None, max_length=500)
    og_title: Optional[str] = Field(None, max_length=255)
    og_description: Optional[str] = Field(None, max_length=500)
    og_image: Optional[str] = Field(None, max_length=500)
    canonical: Optional[str] = Field(None, max_length=500)
    category_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None


class BlogPostCreate(BlogPostBase):
    pass


class BlogPostUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    status: Optional[BlogPostStatus] = None
    excerpt: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    cover_image: Optional[str] = Field(None, max_length=500)
    seo_title: Optional[str] = Field(None, max_length=255)
    seo_description: Optional[str] = Field(None, max_length=500)
    og_title: Optional[str] = Field(None, max_length=255)
    og_description: Optional[str] = Field(None, max_length=500)
    og_image: Optional[str] = Field(None, max_length=500)
    canonical: Optional[str] = Field(None, max_length=500)
    category_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None


class BlogPostResponse(BaseModel):
    id: int
    title: str
    slug: str
    status: BlogPostStatus
    excerpt: Optional[str]
    content: Optional[str]
    cover_image: Optional[str]
    seo_title: Optional[str]
    seo_description: Optional[str]
    og_title: Optional[str]
    og_description: Optional[str]
    og_image: Optional[str]
    canonical: Optional[str]
    author_id: Optional[int]
    category_id: Optional[int]
    category: Optional[BlogCategoryResponse]
    tags: List[BlogTagResponse] = []
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BlogPostListResponse(BaseModel):
    total: int
    items: List[BlogPostResponse]
