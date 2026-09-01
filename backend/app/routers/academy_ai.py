"""ИИ-консультант академии (модуль academy_ai).

Этап A — каркас: рабочие CRUD базы знаний и аудита + статус модуля.
Консультации, генерация контента и планировщик подключаются на следующих этапах
и пока возвращают 501.
"""
import os
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    AcademyAuditAnswer,
    AcademyAuditQuestion,
    AcademyAuditSession,
    AcademyAuditSessionStatus,
    AcademyContentDraft,
    AcademyContentDraftStatus,
    AcademyDialog,
    AcademyExpertiseChunk,
    AcademyExpertiseSource,
    AcademyInsight,
    AcademyKbEntry,
    AcademyKbEntryKind,
    AcademyScheduleRule,
    User,
)
from app.routers.action_log import log_action
from app.schemas.academy_ai import (
    AuditAnswerIn,
    AuditAnswerOut,
    AuditQuestionOut,
    AuditSessionOut,
    ConsultRequest,
    ConsultResponse,
    ContentDraftList,
    ContentDraftOut,
    ContentDraftStatusUpdate,
    ContentDraftUpdate,
    ContentGenerateRequest,
    DialogDetail,
    DialogOut,
    ExpertiseChunkOut,
    ExpertiseIngestResult,
    ExpertiseSourceCreate,
    ExpertiseSourceOut,
    ImageRenderResult,
    InsightList,
    InsightOut,
    InsightScanResult,
    KbEnrichResult,
    KbEntryCreate,
    KbEntryList,
    KbEntryOut,
    KbEntryUpdate,
    ModuleStatus,
    ReindexResult,
    ScheduleRuleCreate,
    ScheduleRuleOut,
    ScheduleRuleUpdate,
    ScheduleRunResult,
    SearchResponse,
)
from app.services.academy_ai import content_gen
from app.services.academy_ai import proactivity
from app.services.academy_ai import scheduler as post_scheduler
from app.services.academy_ai import expertise_library as expertise
from app.services.academy_ai import knowledge_base as kb
from app.services.academy_ai import lms_context
from app.services.academy_ai import orchestrator
from app.services.academy_ai import retrieval
from app.services.academy_ai import storage as kb_storage

router = APIRouter()


def _module_enabled() -> bool:
    return (os.getenv("ACADEMY_AI_ENABLED", "0").strip().lower() in ("1", "true", "yes"))


def _ai_gateway_configured() -> bool:
    return bool((os.getenv("AI_TUNNEL_API_KEY") or os.getenv("RANVIK_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or "").strip())


def _require_enabled() -> None:
    if not _module_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Модуль ИИ-консультанта отключён")


# ─── Статус ────────────────────────────────────────────────────────────────

@router.get("/status", response_model=ModuleStatus)
def get_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    return ModuleStatus(
        enabled=_module_enabled(),
        ai_gateway_configured=_ai_gateway_configured(),
        kb_entries=db.query(AcademyKbEntry).filter(AcademyKbEntry.is_active.is_(True)).count(),
        expertise_sources=db.query(AcademyExpertiseSource).filter(AcademyExpertiseSource.status == "active").count(),
        pending_drafts=db.query(AcademyContentDraft)
        .filter(AcademyContentDraft.status == AcademyContentDraftStatus.DRAFT.value)
        .count(),
        search_backend=retrieval.search_backend(db),
        pending_embeddings=retrieval.pending_embeddings(db),
        open_insights=db.query(AcademyInsight).filter(AcademyInsight.status == "open").count(),
    )


# ─── Проактивность (подсказки консультанта) ─────────────────────────────────

@router.get("/insights", response_model=InsightList)
def list_insights(
    status_filter: str = Query("open", alias="status", pattern="^(open|dismissed|resolved|all)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    query = db.query(AcademyInsight)
    if status_filter != "all":
        query = query.filter(AcademyInsight.status == status_filter)
    total = query.count()
    items = query.order_by(AcademyInsight.created_at.desc()).limit(limit).all()
    return InsightList(items=items, total=total)


@router.post("/insights/{insight_id}/dismiss", response_model=InsightOut)
def dismiss_insight(
    insight_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    insight = db.query(AcademyInsight).filter(AcademyInsight.id == insight_id).first()
    if not insight:
        raise HTTPException(status_code=404, detail="Подсказка не найдена")
    insight.status = "dismissed"
    insight.resolved_at = func.now()
    insight.resolved_by_id = current_user.id
    db.commit()
    db.refresh(insight)
    return insight


@router.post("/insights/scan", response_model=InsightScanResult)
def scan_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    _require_enabled()
    return InsightScanResult(**proactivity.scan(db))


# ─── Смысловой поиск ───────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse)
async def semantic_search(
    q: str = Query(..., min_length=2),
    k: int = Query(8, ge=1, le=30),
    scope: Optional[str] = Query(None, pattern="^(kb|expertise)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    scopes = (scope,) if scope else ("kb", "expertise")
    hits = await retrieval.search(db, q, scopes=scopes, k=k, user_id=current_user.id)
    return SearchResponse(query=q, backend=retrieval.search_backend(db), hits=hits)


@router.post("/search/reindex", response_model=ReindexResult)
async def reindex_embeddings(
    scope: Optional[str] = Query(None, pattern="^(kb|expertise)$"),
    batch: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    result = await retrieval.index_pending(db, scope=scope, batch=batch, user_id=current_user.id)
    return ReindexResult(
        indexed=int(result.get("indexed", 0)),
        backend=str(result.get("backend", "ilike")),
        reason=result.get("reason"),
    )


# ─── База знаний ───────────────────────────────────────────────────────────

@router.get("/knowledge", response_model=KbEntryList)
def list_kb_entries(
    section: Optional[str] = None,
    kind: Optional[str] = None,
    q: Optional[str] = None,
    include_inactive: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_view")),
):
    query = db.query(AcademyKbEntry)
    if not include_inactive:
        query = query.filter(AcademyKbEntry.is_active.is_(True))
    if section:
        query = query.filter(AcademyKbEntry.section == section)
    if kind:
        query = query.filter(AcademyKbEntry.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(AcademyKbEntry.title.ilike(like) | AcademyKbEntry.body_text.ilike(like))
    total = query.count()
    items = query.order_by(AcademyKbEntry.created_at.desc()).offset(offset).limit(limit).all()
    return KbEntryList(items=items, total=total)


@router.post("/knowledge", response_model=KbEntryOut, status_code=status.HTTP_201_CREATED)
def create_kb_entry(
    payload: KbEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    if payload.kind not in {k.value for k in AcademyKbEntryKind}:
        raise HTTPException(status_code=422, detail="Некорректный тип записи")
    entry = AcademyKbEntry(
        kind=payload.kind,
        section=payload.section,
        title=payload.title,
        body_text=payload.body_text,
        tags=payload.tags,
        source_url=payload.source_url,
        storage_key=payload.storage_key,
        direction=payload.direction,
        meta=payload.meta,
        created_by_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    kb.reindex_entry(db, entry)
    log_action(db, current_user.id, "create", "academy_kb_entry", entry.id, {"title": entry.title})
    return entry


@router.post("/knowledge/upload", response_model=KbEntryOut, status_code=status.HTTP_201_CREATED)
async def upload_kb_file(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    section: Optional[str] = Form(None),
    direction: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    data = await file.read()
    try:
        storage_key = kb_storage.save_bytes(data, file.filename or "file")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    content_type = file.content_type or "application/octet-stream"
    kind = AcademyKbEntryKind.MEDIA.value if content_type.startswith(("image/", "video/", "audio/")) else AcademyKbEntryKind.DOCUMENT.value
    entry = AcademyKbEntry(
        kind=kind,
        section=section,
        direction=direction,
        title=(title or file.filename or "Материал").strip()[:256],
        storage_key=storage_key,
        meta={"content_type": content_type, "size": len(data), "filename": file.filename},
        created_by_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    kb.reindex_entry(db, entry)
    log_action(db, current_user.id, "upload", "academy_kb_entry", entry.id, {"title": entry.title})
    return entry


@router.post("/knowledge/{entry_id}/enrich", response_model=KbEnrichResult)
async def enrich_kb_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    entry = db.query(AcademyKbEntry).filter(AcademyKbEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    applied = await kb.enrich_entry(db, entry, user_id=current_user.id)
    return KbEnrichResult(applied=applied, entry=entry)


@router.get("/knowledge/{entry_id}/file")
def download_kb_file(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_view")),
):
    entry = db.query(AcademyKbEntry).filter(AcademyKbEntry.id == entry_id).first()
    if not entry or not entry.storage_key:
        raise HTTPException(status_code=404, detail="Файл не найден")
    try:
        path = kb_storage.resolve_path(entry.storage_key)
    except ValueError:
        raise HTTPException(status_code=404, detail="Файл не найден")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует в хранилище")
    content_type = (entry.meta or {}).get("content_type") or "application/octet-stream"
    name = (entry.meta or {}).get("filename") or entry.title
    encoded = quote(str(name))
    return FileResponse(
        path,
        media_type=content_type,
        filename=str(name),
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded}"},
    )


@router.get("/knowledge/{entry_id}", response_model=KbEntryOut)
def get_kb_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_view")),
):
    entry = db.query(AcademyKbEntry).filter(AcademyKbEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return entry


@router.patch("/knowledge/{entry_id}", response_model=KbEntryOut)
def update_kb_entry(
    entry_id: int,
    payload: KbEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    entry = db.query(AcademyKbEntry).filter(AcademyKbEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    if {"title", "body_text"} & set(updates):
        kb.reindex_entry(db, entry)
    log_action(db, current_user.id, "update", "academy_kb_entry", entry.id, {"title": entry.title})
    return entry


@router.delete("/knowledge/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_kb_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.knowledge_manage")),
):
    entry = db.query(AcademyKbEntry).filter(AcademyKbEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    entry.is_active = False
    db.commit()
    log_action(db, current_user.id, "archive", "academy_kb_entry", entry.id, None)


# ─── Библиотека экспертизы ─────────────────────────────────────────────────

def _expertise_out(db: Session, source: AcademyExpertiseSource) -> ExpertiseSourceOut:
    count = (
        db.query(func.count(AcademyExpertiseChunk.id))
        .filter(AcademyExpertiseChunk.source_id == source.id)
        .scalar()
        or 0
    )
    return ExpertiseSourceOut(
        id=source.id,
        title=source.title,
        type=source.type,
        status=source.status,
        origin_url=source.origin_url,
        storage_key=source.storage_key,
        ai_description=source.ai_description,
        added_by_id=source.added_by_id,
        created_at=source.created_at,
        updated_at=source.updated_at,
        chunk_count=int(count),
    )


@router.get("/expertise", response_model=List[ExpertiseSourceOut])
def list_expertise_sources(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    query = db.query(AcademyExpertiseSource)
    if status_filter in ("active", "disabled"):
        query = query.filter(AcademyExpertiseSource.status == status_filter)
    return [_expertise_out(db, s) for s in query.order_by(AcademyExpertiseSource.created_at.desc()).all()]


@router.post("/expertise", response_model=ExpertiseIngestResult, status_code=status.HTTP_201_CREATED)
async def create_text_expertise_source(
    payload: ExpertiseSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.expertise_manage")),
):
    if not (payload.text or payload.origin_url):
        raise HTTPException(status_code=422, detail="Нужен text или origin_url")
    source = AcademyExpertiseSource(
        title=payload.title,
        type=payload.type,
        origin_url=payload.origin_url,
        added_by_id=current_user.id,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    stats = await expertise.ingest_source(db, source, raw_text=payload.text, user_id=current_user.id)
    log_action(db, current_user.id, "create", "academy_expertise_source", source.id, {"title": source.title})
    return ExpertiseIngestResult(source=_expertise_out(db, source), **stats)


@router.post("/expertise/upload", response_model=ExpertiseIngestResult, status_code=status.HTTP_201_CREATED)
async def upload_expertise_source(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    type: str = Form("book"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.expertise_manage")),
):
    data = await file.read()
    try:
        storage_key = kb_storage.save_bytes(data, file.filename or "source")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    source = AcademyExpertiseSource(
        title=(title or file.filename or "Источник").strip()[:512],
        type=type,
        storage_key=storage_key,
        added_by_id=current_user.id,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    stats = await expertise.ingest_source(db, source, user_id=current_user.id)
    log_action(db, current_user.id, "upload", "academy_expertise_source", source.id, {"title": source.title})
    return ExpertiseIngestResult(source=_expertise_out(db, source), **stats)


@router.post("/expertise/{source_id}/reingest", response_model=ExpertiseIngestResult)
async def reingest_expertise_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.expertise_manage")),
):
    source = db.query(AcademyExpertiseSource).filter(AcademyExpertiseSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Источник не найден")
    source.ai_description = None
    stats = await expertise.ingest_source(db, source, user_id=current_user.id)
    return ExpertiseIngestResult(source=_expertise_out(db, source), **stats)


@router.post("/expertise/{source_id}/status", response_model=ExpertiseSourceOut)
def set_expertise_status(
    source_id: int,
    value: str = Query(..., pattern="^(active|disabled)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.expertise_manage")),
):
    source = db.query(AcademyExpertiseSource).filter(AcademyExpertiseSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Источник не найден")
    expertise.set_status(db, source, value)
    log_action(db, current_user.id, "status", "academy_expertise_source", source.id, {"status": value})
    return _expertise_out(db, source)


@router.get("/expertise/{source_id}/chunks", response_model=List[ExpertiseChunkOut])
def preview_expertise_chunks(
    source_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    return expertise.chunk_preview(db, source_id, limit=limit, offset=offset)


@router.delete("/expertise/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expertise_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.expertise_manage")),
):
    source = db.query(AcademyExpertiseSource).filter(AcademyExpertiseSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Источник не найден")
    if source.storage_key:
        kb_storage.delete(source.storage_key)
    db.delete(source)
    db.commit()
    log_action(db, current_user.id, "delete", "academy_expertise_source", source_id, None)


# ─── Аудит ─────────────────────────────────────────────────────────────────

@router.get("/audit/questions", response_model=List[AuditQuestionOut])
def list_audit_questions(
    section: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.audit")),
):
    query = db.query(AcademyAuditQuestion).filter(AcademyAuditQuestion.is_active.is_(True))
    if section:
        query = query.filter(AcademyAuditQuestion.section == section)
    return query.order_by(AcademyAuditQuestion.sort_order, AcademyAuditQuestion.id).all()


@router.post("/audit/sessions", response_model=AuditSessionOut, status_code=status.HTTP_201_CREATED)
def start_audit_session(
    kind: str = "initial",
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.audit")),
):
    session = AcademyAuditSession(kind=kind, started_by_id=current_user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/audit/sessions/{session_id}", response_model=AuditSessionOut)
def get_audit_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.audit")),
):
    session = db.query(AcademyAuditSession).filter(AcademyAuditSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Сессия аудита не найдена")
    return session


@router.post("/audit/sessions/{session_id}/answers", response_model=AuditAnswerOut, status_code=status.HTTP_201_CREATED)
def submit_audit_answer(
    session_id: int,
    payload: AuditAnswerIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.audit")),
):
    session = db.query(AcademyAuditSession).filter(AcademyAuditSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Сессия аудита не найдена")

    section = payload.section
    question = None
    if payload.question_id:
        question = db.query(AcademyAuditQuestion).filter(AcademyAuditQuestion.id == payload.question_id).first()
        if question:
            section = section or question.section

    # Ответ аудита дублируется в базу знаний как структурированная запись.
    kb_entry = AcademyKbEntry(
        kind=AcademyKbEntryKind.AUDIT_ANSWER.value,
        section=section,
        title=(question.prompt[:240] if question else f"Аудит: {section or 'ответ'}"),
        body_text=payload.answer_text,
        meta=payload.structured,
        created_by_id=current_user.id,
    )
    db.add(kb_entry)
    db.flush()

    answer = AcademyAuditAnswer(
        session_id=session.id,
        question_id=payload.question_id,
        section=section,
        answer_text=payload.answer_text,
        structured=payload.structured,
        kb_entry_id=kb_entry.id,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return answer


@router.post("/audit/sessions/{session_id}/complete", response_model=AuditSessionOut)
def complete_audit_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.audit")),
):
    session = db.query(AcademyAuditSession).filter(AcademyAuditSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Сессия аудита не найдена")
    session.status = AcademyAuditSessionStatus.COMPLETED.value
    from sqlalchemy import func as _func

    session.completed_at = _func.now()
    db.commit()
    db.refresh(session)
    return session


# ─── Контекст LMS (read-only инструменты для консультанта) ──────────────────

@router.get("/lms/tools")
def list_lms_tools(
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    """Инструменты доступа к данным LMS, доступные текущему пользователю
    (с учётом его прав)."""
    return {"tools": lms_context.available_tools(current_user)}


@router.post("/lms/tools/{tool_name}")
def run_lms_tool(
    tool_name: str,
    params: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    """Выполнить read-only инструмент по данным LMS. Права проверяются внутри —
    у роли без нужного разрешения вернётся ошибка no_permission."""
    result = lms_context.run_tool(tool_name, db, current_user, **(params or {}))
    if result.get("error") == "unknown_tool":
        raise HTTPException(status_code=404, detail="Неизвестный инструмент")
    if result.get("error") == "no_permission":
        raise HTTPException(status_code=403, detail=f"Нет прав: {', '.join(result['missing_permissions'])}")
    return result


# ─── Консультации ──────────────────────────────────────────────────────────

@router.get("/dialogs", response_model=List[DialogOut])
def list_dialogs(
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    rows = (
        db.query(AcademyDialog)
        .order_by(AcademyDialog.updated_at.desc().nullslast(), AcademyDialog.created_at.desc())
        .limit(limit)
        .all()
    )
    return rows


@router.get("/dialogs/{dialog_id}", response_model=DialogDetail)
def get_dialog(
    dialog_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    dialog = db.query(AcademyDialog).filter(AcademyDialog.id == dialog_id).first()
    if not dialog:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    return dialog


@router.post("/consult", response_model=ConsultResponse)
async def consult(
    payload: ConsultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.access")),
):
    _require_enabled()
    result = await orchestrator.consult(
        db, current_user, message=payload.message, dialog_id=payload.dialog_id
    )
    return ConsultResponse(**result)


# ─── Генерация контента ────────────────────────────────────────────────────

@router.post("/content/generate", response_model=ContentDraftOut, status_code=status.HTTP_201_CREATED)
async def generate_content(
    payload: ContentGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    _require_enabled()
    try:
        draft = await content_gen.generate(
            db,
            current_user,
            kind=payload.kind,
            brief=payload.brief,
            direction=payload.direction,
            tone=payload.tone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    log_action(db, current_user.id, "generate", "academy_content_draft", draft.id, {"kind": draft.kind})
    return draft


@router.get("/content/drafts", response_model=ContentDraftList)
def list_content_drafts(
    status_filter: Optional[str] = Query(None, alias="status"),
    kind: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    query = db.query(AcademyContentDraft)
    if status_filter:
        query = query.filter(AcademyContentDraft.status == status_filter)
    if kind:
        query = query.filter(AcademyContentDraft.kind == kind)
    total = query.count()
    items = query.order_by(AcademyContentDraft.created_at.desc()).offset(offset).limit(limit).all()
    return ContentDraftList(items=items, total=total)


@router.get("/content/drafts/{draft_id}", response_model=ContentDraftOut)
def get_content_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    draft = db.query(AcademyContentDraft).filter(AcademyContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    return draft


@router.patch("/content/drafts/{draft_id}", response_model=ContentDraftOut)
def update_content_draft(
    draft_id: int,
    payload: ContentDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    draft = db.query(AcademyContentDraft).filter(AcademyContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(draft, field, value)
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/content/drafts/{draft_id}/status", response_model=ContentDraftOut)
def set_content_draft_status(
    draft_id: int,
    payload: ContentDraftStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    draft = db.query(AcademyContentDraft).filter(AcademyContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    try:
        content_gen.set_status(db, draft, payload.status, feedback=payload.feedback)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    log_action(db, current_user.id, "status", "academy_content_draft", draft.id, {"status": payload.status})
    return draft


@router.post("/content/drafts/{draft_id}/image", response_model=ImageRenderResult)
async def render_content_draft_image(
    draft_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    draft = db.query(AcademyContentDraft).filter(AcademyContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    result = await content_gen.render_image(db, draft, user_id=current_user.id)
    return ImageRenderResult(ok=result["ok"], detail=result["detail"], draft=draft)


@router.delete("/content/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.generate")),
):
    draft = db.query(AcademyContentDraft).filter(AcademyContentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Черновик не найден")
    if draft.image_storage_key:
        kb_storage.delete(draft.image_storage_key)
    db.delete(draft)
    db.commit()


# ─── Планировщик регулярных постов ─────────────────────────────────────────

@router.get("/schedule/rules", response_model=List[ScheduleRuleOut])
def list_schedule_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.scheduler_manage")),
):
    return db.query(AcademyScheduleRule).order_by(AcademyScheduleRule.created_at.desc()).all()


@router.post("/schedule/rules", response_model=ScheduleRuleOut, status_code=status.HTTP_201_CREATED)
def create_schedule_rule(
    payload: ScheduleRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.scheduler_manage")),
):
    if post_scheduler.next_run_from_cadence(payload.cadence) is None:
        raise HTTPException(status_code=422, detail="Некорректное cron-выражение в cadence")
    rule = AcademyScheduleRule(
        name=payload.name,
        cadence=payload.cadence,
        topics=payload.topics,
        proportions=payload.proportions,
        tone=payload.tone,
        is_active=payload.is_active,
        next_run_at=post_scheduler.next_run_from_cadence(payload.cadence),
        created_by_id=current_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/schedule/rules/{rule_id}", response_model=ScheduleRuleOut)
def update_schedule_rule(
    rule_id: int,
    payload: ScheduleRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.scheduler_manage")),
):
    rule = db.query(AcademyScheduleRule).filter(AcademyScheduleRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    updates = payload.model_dump(exclude_unset=True)
    if "cadence" in updates:
        if post_scheduler.next_run_from_cadence(updates["cadence"]) is None:
            raise HTTPException(status_code=422, detail="Некорректное cron-выражение в cadence")
    for field, value in updates.items():
        setattr(rule, field, value)
    if "cadence" in updates:
        rule.next_run_at = post_scheduler.next_run_from_cadence(updates["cadence"])
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/schedule/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.scheduler_manage")),
):
    rule = db.query(AcademyScheduleRule).filter(AcademyScheduleRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    db.delete(rule)
    db.commit()


@router.post("/schedule/run", response_model=ScheduleRunResult)
async def run_schedule_now(
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("academy_ai.scheduler_manage")),
):
    """Ручной прогон готовых к запуску правил (генерация черновиков сейчас)."""
    _require_enabled()
    result = await post_scheduler.dispatch_due_rules(db, limit=limit)
    return ScheduleRunResult(**result)
