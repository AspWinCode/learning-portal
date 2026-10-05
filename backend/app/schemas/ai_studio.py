"""Pydantic-схемы AI Studio (app/routers/ai_studio.py).

Phase 1: workspaces, knowledge, templates, generate, content + transform.
Content-plan и event-pack — Phase 2 (не входят в эти схемы)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

_ORM = {"from_attributes": True}


# ─── Workspaces ─────────────────────────────────────────────────────────────

class WorkspaceOut(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    system_prompt: Optional[str]
    tone_of_voice: Optional[str]
    audience_description: Optional[str]
    brand_context: Optional[Dict[str, Any]]
    default_language: str
    is_active: bool

    model_config = _ORM


class WorkspaceListItem(BaseModel):
    """Облегчённая версия для селектора направлений — без полного бренд-контекста."""

    id: int
    code: str
    name: str
    description: Optional[str]
    is_active: bool

    model_config = _ORM


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    tone_of_voice: Optional[str] = None
    audience_description: Optional[str] = None
    brand_context: Optional[Dict[str, Any]] = None
    default_language: Optional[str] = None
    is_active: Optional[bool] = None


class BrandContextFieldOut(BaseModel):
    key: str
    label: str


# ─── Knowledge ──────────────────────────────────────────────────────────────

class KnowledgeItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    content: str = Field(..., min_length=1)
    source_type: str = "manual"  # manual/document/website/post/event/faq/instruction
    source_url: Optional[str] = Field(None, max_length=1024)


class KnowledgeItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    content: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=1024)
    is_active: Optional[bool] = None


class KnowledgeItemOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    content: str
    source_type: str
    source_url: Optional[str]
    is_active: bool
    created_by_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class KnowledgeItemList(BaseModel):
    items: List[KnowledgeItemOut]
    total: int


# ─── Templates ──────────────────────────────────────────────────────────────

class TemplateOut(BaseModel):
    id: int
    workspace_id: int
    code: str
    name: str
    description: Optional[str]
    input_schema_json: Optional[Dict[str, Any]]
    output_format: str
    sort_order: int
    is_active: bool

    model_config = _ORM


# ─── Generate / Content ─────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    template_code: str
    input_data: Dict[str, Any] = Field(default_factory=dict)


class ContentOut(BaseModel):
    id: int
    workspace_id: int
    template_id: Optional[int]
    parent_content_id: Optional[int]
    created_by_id: Optional[int]
    title: Optional[str]
    input_json: Optional[Dict[str, Any]]
    output_text: Optional[str]
    provider: Optional[str]
    model: Optional[str]
    status: str
    is_favorite: bool
    tags: Optional[List[str]]
    channel: Optional[str]
    scheduled_date: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class ContentList(BaseModel):
    items: List[ContentOut]
    total: int


class ContentUpdate(BaseModel):
    status: Optional[str] = None  # draft/approved/archived
    is_favorite: Optional[bool] = None
    tags: Optional[List[str]] = None
    channel: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    title: Optional[str] = None
    output_text: Optional[str] = None


class TransformRequest(BaseModel):
    action: str
    channel: Optional[str] = None


TRANSFORM_ACTION_CHOICES = (
    "shorter",
    "livelier",
    "more_emotional",
    "more_official",
    "for_parents",
    "for_teens",
    "for_vk",
    "for_telegram",
    "add_cta",
    "remove_ad_tone",
    "three_variants",
)
