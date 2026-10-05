"""База знаний направления: CRUD + простой keyword-поиск.

Phase 1 — только текстовые knowledge items, поиск через ILIKE по словам
запроса (без pgvector/embeddings — см. retrieval.py Академии как пример,
куда это можно вырасти позже через тот же _SCOPES-паттерн). Изоляция между
направлениями обеспечивается фильтром по workspace_id во всех запросах —
никакого кросс-workspace fallback.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import AiKnowledgeItem, AiWorkspace

_WORD_RE = re.compile(r"[\wа-яёА-ЯЁ]{3,}", re.UNICODE)


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


def search(db: Session, workspace: AiWorkspace, query: str, *, limit: int = 5) -> List[AiKnowledgeItem]:
    words = _WORD_RE.findall(query or "")
    base = db.query(AiKnowledgeItem).filter(
        AiKnowledgeItem.workspace_id == workspace.id,
        AiKnowledgeItem.is_active.is_(True),
    )
    if not words:
        return base.order_by(AiKnowledgeItem.created_at.desc()).limit(limit).all()

    conditions = []
    for word in words[:8]:
        like = f"%{word}%"
        conditions.append(AiKnowledgeItem.title.ilike(like))
        conditions.append(AiKnowledgeItem.content.ilike(like))
    hits = base.filter(or_(*conditions)).order_by(AiKnowledgeItem.created_at.desc()).limit(limit).all()
    if hits:
        return hits
    # ничего не нашли по словам — не выдаём чужой/нерелевантный контекст, просто пусто
    return []


def as_prompt_block(items: List[AiKnowledgeItem]) -> str:
    if not items:
        return ""
    lines = [f"[{item.title}] {item.content[:900]}" for item in items]
    return "=== БАЗА ЗНАНИЙ НАПРАВЛЕНИЯ ===\n" + "\n\n".join(lines)
