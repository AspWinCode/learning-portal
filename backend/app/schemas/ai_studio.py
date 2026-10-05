"""Pydantic-схемы AI Studio (app/routers/ai_studio.py).

Phase 1: workspaces, knowledge, templates, generate, content + transform.
Phase 2: content-plan, event-pack, мультиканальные варианты."""
from datetime import date, datetime
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
    group_key: Optional[str]
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


class VariantRequest(BaseModel):
    channel: str = Field(..., min_length=1, max_length=32)


# ─── Content plan (Phase 2) ─────────────────────────────────────────────────

class ContentPlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class ContentPlanItemOut(BaseModel):
    id: int
    plan_id: int
    publish_date: Optional[date]
    channel: Optional[str]
    content_type: Optional[str]
    title: str
    brief: Optional[str]
    generated_content_id: Optional[int]
    status: str

    model_config = _ORM


class ContentPlanOut(BaseModel):
    id: int
    workspace_id: int
    name: str
    date_from: Optional[date]
    date_to: Optional[date]
    created_by_id: Optional[int]
    created_at: Optional[datetime]
    items: List[ContentPlanItemOut] = Field(default_factory=list)

    model_config = _ORM


class ContentPlanItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    publish_date: Optional[date] = None
    channel: Optional[str] = None
    content_type: Optional[str] = None
    brief: Optional[str] = None


class ContentPlanItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    publish_date: Optional[date] = None
    channel: Optional[str] = None
    content_type: Optional[str] = None
    brief: Optional[str] = None
    status: Optional[str] = None  # idea/draft/ready/published/skipped
    generated_content_id: Optional[int] = None


class ContentPlanGenerateRequest(BaseModel):
    count: int = Field(10, ge=1, le=60)
    channels: List[str] = Field(default_factory=list)
    goals: Optional[str] = None
    important_events: Optional[str] = None


# ─── Event pack (Phase 2) ───────────────────────────────────────────────────

class EventPackRequest(BaseModel):
    event_data: Dict[str, Any] = Field(default_factory=dict)


class EventPackResult(BaseModel):
    group_key: str
    items: List[ContentOut]


# ─── Assets / image generation (Phase 3, п.27) ─────────────────────────────

class RenderImageRequest(BaseModel):
    prompt: Optional[str] = None


class AssetOut(BaseModel):
    id: int
    content_id: int
    asset_type: str
    prompt: Optional[str]
    provider: Optional[str]
    model: Optional[str]
    url: Optional[str]
    storage_key: Optional[str]
    created_at: Optional[datetime]

    model_config = _ORM


# ─── Publishing (Phase 3) ───────────────────────────────────────────────────

class PublishRequest(BaseModel):
    channel: str = Field(..., min_length=1, max_length=32)


class PublishLogOut(BaseModel):
    id: int
    content_id: int
    workspace_id: int
    channel: str
    status: str
    external_id: Optional[str]
    external_url: Optional[str]
    error: Optional[str]
    created_at: Optional[datetime]

    model_config = _ORM


class ChannelStatusOut(BaseModel):
    channel: str
    configured: bool


# ─── Analytics (Phase 3, п.28) ──────────────────────────────────────────────

class WorkspaceAnalyticsOut(BaseModel):
    ai_calls_total: int
    ai_calls_error: int
    ai_tokens_total: int
    ai_cost_usd_total: float
    content_by_status: Dict[str, int]
    knowledge_items_active: int


class ReindexResult(BaseModel):
    indexed: int
    backend: str
    reason: Optional[str] = None
