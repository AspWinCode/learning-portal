"""Банк образцовых постов — few-shot для генератора контента.

Это НЕ источник фактов (в отличие от профиля/БЗ/экспертизы/LMS): примеры дают
модели эталон стиля — тон, ритм, длину фраз, использование эмодзи. Владелец
сам решает, что положить в банк (обычно — уже опубликованные посты, которые
ему понравились).
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import AcademyContentExample

DEFAULT_LIMIT = 3


def list_for_kind(
    db: Session, kind: str, *, direction: Optional[str] = None, limit: int = DEFAULT_LIMIT
) -> List[AcademyContentExample]:
    """Примеры нужного вида контента, максимально релевантные направлению:
    сначала примеры с совпадающим direction, затем — без direction (общие)."""
    base_query = db.query(AcademyContentExample).filter(
        AcademyContentExample.is_active.is_(True), AcademyContentExample.kind == kind
    )
    if not direction:
        return base_query.order_by(AcademyContentExample.created_at.desc()).limit(limit).all()

    matched = (
        base_query.filter(AcademyContentExample.direction == direction)
        .order_by(AcademyContentExample.created_at.desc())
        .limit(limit)
        .all()
    )
    if len(matched) >= limit:
        return matched
    rest = (
        base_query.filter(AcademyContentExample.direction.is_(None))
        .order_by(AcademyContentExample.created_at.desc())
        .limit(limit - len(matched))
        .all()
    )
    return matched + rest


def as_prompt_block(examples: List[AcademyContentExample]) -> str:
    if not examples:
        return ""
    parts = []
    for ex in examples:
        header = f"Пример ({ex.title}):" if ex.title else "Пример:"
        parts.append(f"{header}\n{ex.body.strip()}")
    joined = "\n\n---\n\n".join(parts)
    return (
        "=== ОБРАЗЦЫ УДАЧНЫХ ПОСТОВ АКАДЕМИИ (пиши в этом стиле: тон, ритм, длина "
        "фраз, эмодзи — но НЕ копируй из них факты, если они не встречаются в "
        "контексте) ===\n\n" + joined
    )
