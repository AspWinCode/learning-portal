"""Pydantic-схемы AI Studio (app/routers/ai_studio.py).

AI Studio — консультационный/аналитический режим (workspaces, knowledge,
consult). Генерация контента для публикаций, шаблоны, контент-план,
публикация в соцсети — модуль smm_projects (app/schemas/smm_projects.py)."""
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


class ReindexResult(BaseModel):
    indexed: int
    backend: str
    reason: Optional[str] = None


# ─── Consult (chat / analyze) ───────────────────────────────────────────────

class ConsultRequest(BaseModel):
    message: str = Field(..., min_length=1)
    dialog_id: Optional[int] = None


class MessageOut(BaseModel):
    id: int
    dialog_id: int
    role: str
    content: str
    used_knowledge: Optional[List[str]] = None
    created_at: Optional[datetime]

    model_config = _ORM


class DialogOut(BaseModel):
    id: int
    workspace_id: int
    title: Optional[str]
    user_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class DialogDetail(DialogOut):
    messages: List[MessageOut] = Field(default_factory=list)


# ─── Analytics ───────────────────────────────────────────────────────────

class WorkspaceAnalyticsOut(BaseModel):
    ai_calls_total: int
    ai_calls_error: int
    ai_tokens_total: int
    ai_cost_usd_total: float
    dialogs_total: int
    knowledge_items_active: int
