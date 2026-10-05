"""База знаний направления: CRUD + поиск.

Три уровня поиска, выбираются автоматически по возможностям БД — тот же
паттерн, что в app.services.academy_ai.retrieval (откуда реиспользуем чистые
хелперы форматирования вектора/tsquery, п.4 ТЗ — "если в проекте уже есть
AI knowledge/RAG, переиспользовать"):
  1. ``vector``  — pgvector (эмбеддинги через ai_gateway.embed)
  2. ``fts``     — Postgres full-text search (генерируемая колонка search_tsv)
  3. ``ilike``   — грубый фолбэк по подстроке (всегда доступен)

Изоляция между направлениями — фильтр workspace_id во ВСЕХ запросах, никакого
кросс-workspace fallback ни на одном уровне.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.models import AiKnowledgeItem, AiWorkspace
from app.services import ai_gateway
from app.services.academy_ai.retrieval import _or_tsquery_text, _vec_literal

_WORD_RE = re.compile(r"[\wа-яёА-ЯЁ]{3,}", re.UNICODE)

_caps: Optional[Dict[str, bool]] = None


def list_items(db: Session, workspace: AiWorkspace, *, active_only: bool = True) -> List[AiKnowledgeItem]:
    q = db.query(AiKnowledgeItem).filter(AiKnowledgeItem.workspace_id == workspace.id)
    if active_only:
        q = q.filter(AiKnowledgeItem.is_active.is_(True))
    return q.order_by(AiKnowledgeItem.created_at.desc()).all()


def create_item(db: Session, workspace: AiWorkspace, data: Dict[str, Any], *, user_id: Optional[int] = None) -> AiKnowledgeItem:
    item = AiKnowledgeItem(
        workspace_id=workspace.id,
        title=data["title"],
        content=data["content"],
        source_type=data.get("source_type") or "manual",
        source_url=data.get("source_url"),
        created_by_id=user_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item: AiKnowledgeItem, updates: Dict[str, Any]) -> AiKnowledgeItem:
    for field in ("title", "content", "source_type", "source_url", "is_active"):
        if field in updates and updates[field] is not None:
            setattr(item, field, updates[field])
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: AiKnowledgeItem) -> None:
    item.is_active = False
    db.commit()


# ─── Capabilities / индексация embeddings ─────────────────────────────────

def capabilities(db: Session, *, refresh: bool = False) -> Dict[str, bool]:
    global _caps
    if _caps is not None and not refresh:
        return _caps
    caps = {"pgvector": False, "fts": False}
    try:
        caps["pgvector"] = bool(db.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).first())
    except Exception:  # noqa: BLE001
        pass
    try:
        caps["fts"] = bool(
            db.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'ai_knowledge_items' AND column_name = 'search_tsv'"
                )
            ).first()
        )
    except Exception:  # noqa: BLE001
        pass
    _caps = caps
    return caps


def search_backend(db: Session) -> str:
    caps = capabilities(db)
    if caps["pgvector"]:
        return "vector"
    if caps["fts"]:
        return "fts"
    return "ilike"


def pending_embeddings(db: Session, workspace: AiWorkspace) -> int:
    if not capabilities(db)["pgvector"]:
        return 0
    return int(
        db.execute(
            text("SELECT count(*) FROM ai_knowledge_items WHERE workspace_id = :wid AND embedding IS NULL"),
            {"wid": workspace.id},
        ).scalar()
        or 0
    )


async def index_pending(db: Session, workspace: AiWorkspace, *, batch: int = 100, user_id: Optional[int] = None) -> Dict[str, Any]:
    if not capabilities(db)["pgvector"]:
        return {"indexed": 0, "backend": search_backend(db), "reason": "pgvector unavailable"}

    rows = db.execute(
        text(
            "SELECT id, title, content FROM ai_knowledge_items "
            "WHERE workspace_id = :wid AND embedding IS NULL ORDER BY id LIMIT :lim"
        ),
        {"wid": workspace.id, "lim": batch},
    ).all()
    if not rows:
        return {"indexed": 0, "backend": "vector"}

    inputs = [f"{title}\n{content}" for _id, title, content in rows]
    result = await ai_gateway.embed(feature=f"ai_studio:{workspace.code}:knowledge_index", inputs=inputs, user_id=user_id)
    if not result.ok or not result.data or len(result.data) != len(rows):
        return {"indexed": 0, "backend": "vector", "reason": result.error or "embed failed"}

    for (item_id, _title, _content), vector in zip(rows, result.data):
        db.execute(
            text("UPDATE ai_knowledge_items SET embedding = CAST(:v AS vector) WHERE id = :id"),
            {"v": _vec_literal(vector), "id": item_id},
        )
    db.commit()
    return {"indexed": len(rows), "backend": "vector"}


# ─── Поиск ──────────────────────────────────────────────────────────────

def _fetch_ordered(db: Session, workspace: AiWorkspace, ids: List[int]) -> List[AiKnowledgeItem]:
    if not ids:
        return []
    rows = (
        db.query(AiKnowledgeItem)
        .filter(AiKnowledgeItem.id.in_(ids), AiKnowledgeItem.workspace_id == workspace.id)
        .all()
    )
    by_id = {row.id: row for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def _ilike_search(db: Session, workspace: AiWorkspace, query: str, limit: int) -> List[AiKnowledgeItem]:
    words = _WORD_RE.findall(query or "")
    base = db.query(AiKnowledgeItem).filter(
        AiKnowledgeItem.workspace_id == workspace.id,
        AiKnowledgeItem.is_active.is_(True),
    )
    if not words:
        return []
    conditions = []
    for word in words[:8]:
        like = f"%{word}%"
        conditions.append(AiKnowledgeItem.title.ilike(like))
        conditions.append(AiKnowledgeItem.content.ilike(like))
    return base.filter(or_(*conditions)).order_by(AiKnowledgeItem.created_at.desc()).limit(limit).all()


async def search(db: Session, workspace: AiWorkspace, query: str, *, limit: int = 5, user_id: Optional[int] = None) -> List[AiKnowledgeItem]:
    q = (query or "").strip()
    if not q:
        return []

    caps = capabilities(db)

    if caps["pgvector"]:
        emb = await ai_gateway.embed(feature=f"ai_studio:{workspace.code}:knowledge_query", inputs=[q], user_id=user_id)
        if emb.ok and emb.data:
            qvec = _vec_literal(emb.data[0])
            rows = db.execute(
                text(
                    "SELECT id FROM ai_knowledge_items "
                    "WHERE workspace_id = :wid AND is_active AND embedding IS NOT NULL "
                    "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
                ),
                {"wid": workspace.id, "q": qvec, "k": limit},
            ).all()
            hits = _fetch_ordered(db, workspace, [r[0] for r in rows])
            if hits:
                return hits

    if caps["fts"]:
        or_query = _or_tsquery_text(q)
        if or_query:
            rows = db.execute(
                text(
                    "SELECT id, ts_rank(search_tsv, to_tsquery('russian', :q)) AS score FROM ai_knowledge_items "
                    "WHERE workspace_id = :wid AND is_active AND search_tsv @@ to_tsquery('russian', :q) "
                    "ORDER BY score DESC LIMIT :k"
                ),
                {"wid": workspace.id, "q": or_query, "k": limit},
            ).all()
            hits = _fetch_ordered(db, workspace, [r[0] for r in rows])
            if hits:
                return hits

    # без слов в запросе (чистый ilike-фолбэк не нашёл ничего) — пусто, а не
    # чужой/нерелевантный контекст
    return _ilike_search(db, workspace, q, limit)


def as_prompt_block(items: List[AiKnowledgeItem]) -> str:
    if not items:
        return ""
    lines = [f"[{item.title}] {item.content[:900]}" for item in items]
    return "=== БАЗА ЗНАНИЙ НАПРАВЛЕНИЯ ===\n" + "\n\n".join(lines)
