"""Pydantic-схемы модуля ИИ-консультанта академии (academy_ai).

Этап A: рабочие схемы для базы знаний и аудита; остальное — заготовки под
следующие этапы (AI Tunnel, консультации, генерация, планировщик)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

_ORM = {"from_attributes": True}

KB_KINDS = ("fact", "audit_answer", "note", "link", "media", "document")
KB_SECTIONS = ("niche", "finance", "marketing", "sales", "clients", "team")


# ─── База знаний ────────────────────────────────────────────────────────────

class KbEntryCreate(BaseModel):
    kind: str = "fact"
    section: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=256)
    body_text: Optional[str] = None
    tags: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, max_length=1024)
    storage_key: Optional[str] = Field(None, max_length=512)
    direction: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class KbEntryUpdate(BaseModel):
    section: Optional[str] = None
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    body_text: Optional[str] = None
    tags: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, max_length=1024)
    direction: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class KbEntryOut(BaseModel):
    id: int
    kind: str
    section: Optional[str]
    title: str
    body_text: Optional[str]
    ai_description: Optional[str]
    tags: Optional[List[str]]
    storage_key: Optional[str]
    source_url: Optional[str]
    direction: Optional[str]
    is_active: bool
    superseded_by_id: Optional[int]
    valid_from: Optional[datetime]
    created_by_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class KbEntryList(BaseModel):
    items: List[KbEntryOut]
    total: int


class KbEnrichResult(BaseModel):
    applied: Dict[str, Any]
    entry: KbEntryOut


# ─── Библиотека экспертизы ─────────────────────────────────────────────────

class ExpertiseSourceCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    type: str = "book"  # book/article/course/method
    origin_url: Optional[str] = Field(None, max_length=1024)
    text: Optional[str] = None  # текстовый источник без файла


class ExpertiseSourceOut(BaseModel):
    id: int
    title: str
    type: str
    status: str
    origin_url: Optional[str]
    storage_key: Optional[str]
    ai_description: Optional[str]
    added_by_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    chunk_count: int = 0

    model_config = _ORM


class ExpertiseIngestResult(BaseModel):
    chars_extracted: int
    chunks: int
    ocr_used: bool
    source: ExpertiseSourceOut


class ExpertiseChunkOut(BaseModel):
    id: int
    ord: int
    text: str
    token_count: Optional[int]

    model_config = _ORM


# ─── Аудит ─────────────────────────────────────────────────────────────────

class AuditQuestionOut(BaseModel):
    id: int
    section: str
    prompt: str
    hint: Optional[str]
    sort_order: int

    model_config = _ORM


class AuditAnswerIn(BaseModel):
    question_id: Optional[int] = None
    section: Optional[str] = None
    answer_text: str = Field(..., min_length=1)
    structured: Optional[Dict[str, Any]] = None


class AuditAnswerOut(BaseModel):
    id: int
    session_id: int
    question_id: Optional[int]
    section: Optional[str]
    answer_text: Optional[str]
    structured: Optional[Dict[str, Any]]
    kb_entry_id: Optional[int]
    created_at: Optional[datetime]

    model_config = _ORM


class AuditSessionOut(BaseModel):
    id: int
    status: str
    kind: str
    started_by_id: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    answers: List[AuditAnswerOut] = []

    model_config = _ORM


# ─── Консультации / генерация (заготовки под следующие этапы) ────────────────

class ConsultRequest(BaseModel):
    dialog_id: Optional[int] = None
    message: str = Field(..., min_length=1)


class ConsultResponse(BaseModel):
    dialog_id: int
    answer: str
    used_sources: Dict[str, Any] = {}


class DialogMessageOut(BaseModel):
    id: int
    role: str
    content: str
    used_sources: Optional[Dict[str, Any]]
    created_at: Optional[datetime]

    model_config = _ORM


class DialogOut(BaseModel):
    id: int
    title: Optional[str]
    kind: str
    user_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class DialogDetail(DialogOut):
    messages: List[DialogMessageOut] = []


class ContentGenerateRequest(BaseModel):
    kind: str = "post"  # post/summary/image_prompt/newsletter/script
    brief: str = Field(..., min_length=1)
    direction: Optional[str] = None
    tone: Optional[Dict[str, Any]] = None


class ContentDraftUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=256)
    body: Optional[str] = None
    image_prompt: Optional[str] = None


class ContentDraftStatusUpdate(BaseModel):
    status: str  # draft/approved/rejected/published
    feedback: Optional[str] = None


class ContentDraftOut(BaseModel):
    id: int
    kind: str
    status: str
    title: Optional[str]
    body: Optional[str]
    image_prompt: Optional[str]
    image_storage_key: Optional[str]
    based_on: Optional[Dict[str, Any]]
    direction: Optional[str]
    feedback_note: Optional[str]
    schedule_rule_id: Optional[int]
    created_at: Optional[datetime]

    model_config = _ORM


class ContentDraftList(BaseModel):
    items: List[ContentDraftOut]
    total: int


class ImageRenderResult(BaseModel):
    ok: bool
    detail: str
    draft: ContentDraftOut


# ─── Планировщик регулярных постов ─────────────────────────────────────────

class ScheduleRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    cadence: str = Field("0 9 * * 1,3,5", max_length=64)  # cron, 5 полей
    topics: Optional[List[str]] = None
    proportions: Optional[Dict[str, float]] = None
    tone: Optional[Dict[str, Any]] = None
    is_active: bool = True


class ScheduleRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    cadence: Optional[str] = Field(None, max_length=64)
    topics: Optional[List[str]] = None
    proportions: Optional[Dict[str, float]] = None
    tone: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ScheduleRuleOut(BaseModel):
    id: int
    name: str
    cadence: str
    topics: Optional[List[str]]
    proportions: Optional[Dict[str, Any]]
    tone: Optional[Dict[str, Any]]
    is_active: bool
    next_run_at: Optional[datetime]
    created_by_id: Optional[int]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = _ORM


class ScheduleRunResult(BaseModel):
    generated: int
    drafts: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]


# ─── Проактивность ─────────────────────────────────────────────────────────

class InsightOut(BaseModel):
    id: int
    kind: str
    dedup_key: str
    severity: str
    title: str
    body: Optional[str]
    meta: Optional[Dict[str, Any]]
    status: str
    created_at: Optional[datetime]
    resolved_at: Optional[datetime]

    model_config = _ORM


class InsightList(BaseModel):
    items: List[InsightOut]
    total: int


class InsightScanResult(BaseModel):
    created: List[str]
    resolved: List[str]
    open_after: int


class ModuleStatus(BaseModel):
    enabled: bool
    ai_gateway_configured: bool
    kb_entries: int
    expertise_sources: int
    pending_drafts: int
    search_backend: str = "ilike"
    pending_embeddings: int = 0
    open_insights: int = 0


class SearchHit(BaseModel):
    scope: str
    chunk_id: int
    ref_id: int
    title: str
    text: str
    score: float
    method: str


class SearchResponse(BaseModel):
    query: str
    backend: str
    hits: List[SearchHit]


class ReindexResult(BaseModel):
    indexed: int
    backend: str
    reason: Optional[str] = None
