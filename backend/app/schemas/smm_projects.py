"""Pydantic-схемы SMM-проектов (app/routers/smm_projects.py) — автопостинг:
проект, база знаний, каналы публикации, шаблоны, генерация, визуалы,
публикация (вставил текст → выбрал каналы/проект → опубликовал)."""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

_ORM = {"from_attributes": True}


# ─── Projects ───────────────────────────────────────────────────────────────

class ProjectOut(BaseModel):
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


class ProjectListItem(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    is_active: bool

    model_config = _ORM


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
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
    source_type: str = "manual"
    source_url: Optional[str] = Field(None, max_length=1024)


class KnowledgeItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    content: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=1024)
    is_active: Optional[bool] = None


class KnowledgeItemOut(BaseModel):
    id: int
    project_id: int
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


class ReindexResult(BaseModel):
    indexed: int
    backend: str
    reason: Optional[str] = None


# ─── Channels ───────────────────────────────────────────────────────────────

class ChannelConfigSet(BaseModel):
    config: Dict[str, str] = Field(..., description="Поля канала, напр. {token, group_id} для VK")


class ChannelStatusOut(BaseModel):
    channel: str
    configured: bool
    verified: bool = False
    verification_error: Optional[str] = None
    verified_at: Optional[datetime] = None


class ChannelVerifyOut(BaseModel):
    channel: str
    configured: bool
    verified: bool
    error: Optional[str] = None
    chat_id: Optional[str] = None
    chat_title: Optional[str] = None
    feed_url: Optional[str] = None


# ─── Templates ──────────────────────────────────────────────────────────────

class TemplateOut(BaseModel):
    id: int
    project_id: int
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
    project_id: int
    template_id: Optional[int]
    plan_item_id: Optional[int]
    parent_content_id: Optional[int]
    created_by_id: Optional[int]
    title: Optional[str]
    input_json: Optional[Dict[str, Any]]
    output_text: Optional[str]
    output_json: Optional[Dict[str, Any]]
    provider: Optional[str]
    model: Optional[str]
    status: str
    is_favorite: bool
    tags: Optional[List[str]]
    channel: Optional[str]
    group_key: Optional[str]
    selected_asset_id: Optional[int]
    auto_generated: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class ContentList(BaseModel):
    items: List[ContentOut]
    total: int


class ContentUpdate(BaseModel):
    status: Optional[str] = None
    is_favorite: Optional[bool] = None
    tags: Optional[List[str]] = None
    channel: Optional[str] = None
    title: Optional[str] = None
    output_text: Optional[str] = None
    selected_asset_id: Optional[int] = None


class TransformRequest(BaseModel):
    action: str
    channel: Optional[str] = None


class VariantRequest(BaseModel):
    channel: str = Field(..., min_length=1, max_length=32)




# ─── Event pack ─────────────────────────────────────────────────────────────

class EventPackRequest(BaseModel):
    event_data: Dict[str, Any] = Field(default_factory=dict)


class EventPackResult(BaseModel):
    group_key: str
    items: List[ContentOut]


# ─── Assets ─────────────────────────────────────────────────────────────────

class RenderImageRequest(BaseModel):
    prompt: Optional[str] = None


class SelectAssetRequest(BaseModel):
    asset_id: int


class AssetOut(BaseModel):
    id: int
    content_id: int
    asset_type: str
    prompt: Optional[str]
    provider: Optional[str]
    model: Optional[str]
    url: Optional[str]
    storage_key: Optional[str]
    is_selected: bool
    created_at: Optional[datetime]

    model_config = _ORM


# ─── Publishing ─────────────────────────────────────────────────────────────

class PublishRequest(BaseModel):
    channel: str = Field(..., min_length=1, max_length=32)


class PublicationItem(BaseModel):
    channel: str = Field(..., min_length=1, max_length=32)
    content_id: int
    asset_id: Optional[int] = None


class PublishBundleRequest(BaseModel):
    publications: List[PublicationItem] = Field(default_factory=list)
    publish_at: Optional[datetime] = None


class PublicationOut(BaseModel):
    id: int
    content_id: int
    project_id: int
    channel: str
    asset_id: Optional[int]
    text_snapshot: str
    status: str
    scheduled_at: Optional[datetime]
    approved_by_id: Optional[int]
    approved_at: Optional[datetime]
    started_at: Optional[datetime]
    published_at: Optional[datetime]
    external_id: Optional[str]
    external_url: Optional[str]
    attempt_count: int
    last_error: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class PublishLogOut(BaseModel):
    id: int
    content_id: int
    project_id: int
    channel: str
    status: str
    external_id: Optional[str]
    external_url: Optional[str]
    error: Optional[str]
    created_at: Optional[datetime]


# ─── Compose (вставил текст → выбрал каналы/проект → опубликовал) ──────────

class PublicationWithProjectOut(PublicationOut):
    """PublicationOut + то, что нужно виджету в «Запланированные»/«Отправленные»
    при списке публикаций сразу по нескольким проектам: код проекта и превью
    картинки (join по asset_id делается в роутере, не в ORM-relationship)."""
    project_code: str
    asset_url: Optional[str] = None

    model_config = _ORM
