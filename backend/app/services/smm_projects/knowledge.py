"""Project knowledge CRUD and retrieval (pgvector → FTS → ILIKE).

Source access is project-local by default. The personal-social workspace may
read text sources across projects; visual references remain project-local.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.models import SmmKnowledgeItem, SmmProject
from app.services import ai_gateway
from app.services.academy_ai.retrieval import _or_tsquery_text, _vec_literal
from app.services.smm_projects import projects as projects_svc
from app.services.smm_projects import storage

_WORD_RE = re.compile(r"[\wа-яёА-ЯЁ]{3,}", re.UNICODE)

_caps: Optional[Dict[str, bool]] = None


def list_items(db: Session, project: SmmProject, *, active_only: bool = True) -> List[SmmKnowledgeItem]:
    q = db.query(SmmKnowledgeItem).filter(SmmKnowledgeItem.project_id == project.id)
    if active_only:
        q = q.filter(SmmKnowledgeItem.is_active.is_(True))
    return q.order_by(SmmKnowledgeItem.created_at.desc()).all()


def content_items(db: Session, project: SmmProject, *, active_only: bool = True) -> List[SmmKnowledgeItem]:
    """Text sources for generation; visual references stay project-local."""
    source_projects = projects_svc.content_source_projects(db, project)
    project_ids = [source.id for source in source_projects]
    q = db.query(SmmKnowledgeItem).filter(SmmKnowledgeItem.project_id.in_(project_ids))
    if active_only:
        q = q.filter(SmmKnowledgeItem.is_active.is_(True))
    return [
        item for item in q.order_by(SmmKnowledgeItem.created_at.desc()).all()
        if item.source_type != "image_reference" and not (item.content_type or "").lower().startswith("image/")
    ]


def create_item(db: Session, project: SmmProject, data: Dict[str, Any], *, user_id: Optional[int] = None) -> SmmKnowledgeItem:
    item = SmmKnowledgeItem(
        project_id=project.id,
        title=data["title"],
        content=data["content"],
        source_type=data.get("source_type") or "manual",
        source_url=data.get("source_url"),
        storage_key=data.get("storage_key"),
        original_filename=data.get("original_filename"),
        content_type=data.get("content_type"),
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
    if item.storage_key:
        storage.delete(item.storage_key)


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


def _fetch_ordered(
    db: Session, project: SmmProject, ids: List[int], *, exclude_visual: bool = False,
) -> List[SmmKnowledgeItem]:
    if not ids:
        return []
    rows = (
        db.query(SmmKnowledgeItem)
        .filter(SmmKnowledgeItem.id.in_(ids), SmmKnowledgeItem.project_id == project.id)
        .all()
    )
    by_id = {row.id: row for row in rows}
    ordered = [by_id[i] for i in ids if i in by_id]
    if exclude_visual:
        ordered = [
            item for item in ordered
            if item.source_type != "image_reference" and not (item.content_type or "").lower().startswith("image/")
        ]
    return ordered


def _ilike_search(
    db: Session, project: SmmProject, query: str, limit: int, *, exclude_visual: bool = False,
) -> List[SmmKnowledgeItem]:
    words = _WORD_RE.findall(query or "")
    base = db.query(SmmKnowledgeItem).filter(
        SmmKnowledgeItem.project_id == project.id,
        SmmKnowledgeItem.is_active.is_(True),
    )
    if exclude_visual:
        base = base.filter(SmmKnowledgeItem.source_type != "image_reference")
        base = base.filter(or_(SmmKnowledgeItem.content_type.is_(None), ~SmmKnowledgeItem.content_type.ilike("image/%")))
    if not words:
        return []
    conditions = []
    for word in words[:8]:
        like = f"%{word}%"
        conditions.append(SmmKnowledgeItem.title.ilike(like))
        conditions.append(SmmKnowledgeItem.content.ilike(like))
    return base.filter(or_(*conditions)).order_by(SmmKnowledgeItem.created_at.desc()).limit(limit).all()


async def search(
    db: Session, project: SmmProject, query: str, *, limit: int = 5,
    user_id: Optional[int] = None, _apply_content_scope: bool = True, _exclude_visual: bool = False,
) -> List[SmmKnowledgeItem]:
    q = (query or "").strip()
    if not q:
        return []

    source_projects = projects_svc.content_source_projects(db, project) if _apply_content_scope else [project]
    if len(source_projects) > 1:
        results: List[SmmKnowledgeItem] = []
        seen: set[int] = set()
        for source_project in source_projects:
            hits = await search(
                db, source_project, q, limit=limit, user_id=user_id, _apply_content_scope=False,
                _exclude_visual=source_project.id != project.id,
            )
            for hit in hits:
                if hit.id not in seen:
                    seen.add(hit.id)
                    results.append(hit)
        return results[:limit * len(source_projects)]

    caps = capabilities(db)
    text_only_filter = (
        " AND source_type != 'image_reference' AND (content_type IS NULL OR content_type NOT ILIKE 'image/%')"
        if _exclude_visual else ""
    )

    if caps["pgvector"]:
        emb = await ai_gateway.embed(feature=f"smm_projects:{project.code}:knowledge_query", inputs=[q], user_id=user_id)
        if emb.ok and emb.data:
            qvec = _vec_literal(emb.data[0])
            rows = db.execute(
                text(
                    "SELECT id FROM smm_knowledge_items "
                    "WHERE project_id = :pid AND is_active AND embedding IS NOT NULL"
                    + text_only_filter + " "
                    "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
                ),
                {"pid": project.id, "q": qvec, "k": limit},
            ).all()
            hits = _fetch_ordered(db, project, [r[0] for r in rows], exclude_visual=_exclude_visual)
            if hits:
                return hits

    if caps["fts"]:
        or_query = _or_tsquery_text(q)
        if or_query:
            rows = db.execute(
                text(
                    "SELECT id, ts_rank(search_tsv, to_tsquery('russian', :q)) AS score FROM smm_knowledge_items "
                    "WHERE project_id = :pid AND is_active AND search_tsv @@ to_tsquery('russian', :q)"
                    + text_only_filter + " "
                    "ORDER BY score DESC LIMIT :k"
                ),
                {"pid": project.id, "q": or_query, "k": limit},
            ).all()
            hits = _fetch_ordered(db, project, [r[0] for r in rows], exclude_visual=_exclude_visual)
            if hits:
                return hits

    return _ilike_search(db, project, q, limit, exclude_visual=_exclude_visual)


def as_prompt_block(items: List[SmmKnowledgeItem], *, max_chars: int | None = None) -> str:
    if not items:
        return ""
    lines = []
    used = 0
    for item in items:
        line = f"[{item.title}] {item.content[:900]}"
        if max_chars is not None and used + len(line) > max_chars:
            remaining = max_chars - used
            if remaining > 80:
                lines.append(line[:remaining])
            break
        lines.append(line)
        used += len(line) + 2
    return "=== БАЗА ЗНАНИЙ ПРОЕКТА ===\n" + "\n\n".join(lines)
