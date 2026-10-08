"""База знаний проекта: CRUD + 3-уровневый поиск (pgvector → FTS → ILIKE) —
тот же паттерн, что в app.services.ai_studio.knowledge / academy_ai.retrieval
(реиспользуем чистые хелперы форматирования вектора/tsquery). Изоляция между
проектами — фильтр project_id во всех запросах."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.models import SmmKnowledgeItem, SmmProject
from app.services import ai_gateway
from app.services.academy_ai.retrieval import _or_tsquery_text, _vec_literal

_WORD_RE = re.compile(r"[\wа-яёА-ЯЁ]{3,}", re.UNICODE)

_caps: Optional[Dict[str, bool]] = None


def list_items(db: Session, project: SmmProject, *, active_only: bool = True) -> List[SmmKnowledgeItem]:
    q = db.query(SmmKnowledgeItem).filter(SmmKnowledgeItem.project_id == project.id)
    if active_only:
        q = q.filter(SmmKnowledgeItem.is_active.is_(True))
    return q.order_by(SmmKnowledgeItem.created_at.desc()).all()


def create_item(db: Session, project: SmmProject, data: Dict[str, Any], *, user_id: Optional[int] = None) -> SmmKnowledgeItem:
    item = SmmKnowledgeItem(
        project_id=project.id,
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


def update_item(db: Session, item: SmmKnowledgeItem, updates: Dict[str, Any]) -> SmmKnowledgeItem:
    for field in ("title", "content", "source_type", "source_url", "is_active"):
        if field in updates and updates[field] is not None:
            setattr(item, field, updates[field])
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: SmmKnowledgeItem) -> None:
    item.is_active = False
    db.commit()


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
                    "WHERE table_name = 'smm_knowledge_items' AND column_name = 'search_tsv'"
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


def pending_embeddings(db: Session, project: SmmProject) -> int:
    if not capabilities(db)["pgvector"]:
        return 0
    return int(
        db.execute(
            text("SELECT count(*) FROM smm_knowledge_items WHERE project_id = :pid AND embedding IS NULL"),
            {"pid": project.id},
        ).scalar()
        or 0
    )


async def index_pending(db: Session, project: SmmProject, *, batch: int = 100, user_id: Optional[int] = None) -> Dict[str, Any]:
    if not capabilities(db)["pgvector"]:
        return {"indexed": 0, "backend": search_backend(db), "reason": "pgvector unavailable"}

    rows = db.execute(
        text(
            "SELECT id, title, content FROM smm_knowledge_items "
            "WHERE project_id = :pid AND embedding IS NULL ORDER BY id LIMIT :lim"
        ),
        {"pid": project.id, "lim": batch},
    ).all()
    if not rows:
        return {"indexed": 0, "backend": "vector"}

    inputs = [f"{title}\n{content}" for _id, title, content in rows]
    result = await ai_gateway.embed(feature=f"smm_projects:{project.code}:knowledge_index", inputs=inputs, user_id=user_id)
    if not result.ok or not result.data or len(result.data) != len(rows):
        return {"indexed": 0, "backend": "vector", "reason": result.error or "embed failed"}

    for (item_id, _title, _content), vector in zip(rows, result.data):
        db.execute(
            text("UPDATE smm_knowledge_items SET embedding = CAST(:v AS vector) WHERE id = :id"),
            {"v": _vec_literal(vector), "id": item_id},
        )
    db.commit()
    return {"indexed": len(rows), "backend": "vector"}


def _fetch_ordered(db: Session, project: SmmProject, ids: List[int]) -> List[SmmKnowledgeItem]:
    if not ids:
        return []
    rows = (
        db.query(SmmKnowledgeItem)
        .filter(SmmKnowledgeItem.id.in_(ids), SmmKnowledgeItem.project_id == project.id)
        .all()
    )
    by_id = {row.id: row for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def _ilike_search(db: Session, project: SmmProject, query: str, limit: int) -> List[SmmKnowledgeItem]:
    words = _WORD_RE.findall(query or "")
    base = db.query(SmmKnowledgeItem).filter(
        SmmKnowledgeItem.project_id == project.id,
        SmmKnowledgeItem.is_active.is_(True),
    )
    if not words:
        return []
    conditions = []
    for word in words[:8]:
        like = f"%{word}%"
        conditions.append(SmmKnowledgeItem.title.ilike(like))
        conditions.append(SmmKnowledgeItem.content.ilike(like))
    return base.filter(or_(*conditions)).order_by(SmmKnowledgeItem.created_at.desc()).limit(limit).all()


async def search(db: Session, project: SmmProject, query: str, *, limit: int = 5, user_id: Optional[int] = None) -> List[SmmKnowledgeItem]:
    q = (query or "").strip()
    if not q:
        return []

    caps = capabilities(db)

    if caps["pgvector"]:
        emb = await ai_gateway.embed(feature=f"smm_projects:{project.code}:knowledge_query", inputs=[q], user_id=user_id)
        if emb.ok and emb.data:
            qvec = _vec_literal(emb.data[0])
            rows = db.execute(
                text(
                    "SELECT id FROM smm_knowledge_items "
                    "WHERE project_id = :pid AND is_active AND embedding IS NOT NULL "
                    "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
                ),
                {"pid": project.id, "q": qvec, "k": limit},
            ).all()
            hits = _fetch_ordered(db, project, [r[0] for r in rows])
            if hits:
                return hits

    if caps["fts"]:
        or_query = _or_tsquery_text(q)
        if or_query:
            rows = db.execute(
                text(
                    "SELECT id, ts_rank(search_tsv, to_tsquery('russian', :q)) AS score FROM smm_knowledge_items "
                    "WHERE project_id = :pid AND is_active AND search_tsv @@ to_tsquery('russian', :q) "
                    "ORDER BY score DESC LIMIT :k"
                ),
                {"pid": project.id, "q": or_query, "k": limit},
            ).all()
            hits = _fetch_ordered(db, project, [r[0] for r in rows])
            if hits:
                return hits

    return _ilike_search(db, project, q, limit)


def as_prompt_block(items: List[SmmKnowledgeItem]) -> str:
    if not items:
        return ""
    lines = [f"[{item.title}] {item.content[:900]}" for item in items]
    return "=== БАЗА ЗНАНИЙ ПРОЕКТА ===\n" + "\n\n".join(lines)
