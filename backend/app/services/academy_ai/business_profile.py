"""Профиль бизнеса академии — постоянный контекст консультанта.

В отличие от базы знаний/экспертизы (retrieval по релевантности), профиль
подмешивается в системный промпт ЦЕЛИКОМ и ВСЕГДА: это немного полей, которые
владелец заполняет один раз и которые должны быть видны консультанту в любом
диалоге, даже если вопрос не совпал ни с одним чанком базы знаний.

Практически singleton: действующая запись — первая по id. Создаётся лениво
при первом обращении (get_or_create), редактируется через PATCH в роутере.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import AcademyBusinessProfile

FIELDS = (
    "mission",
    "target_audience",
    "usp",
    "pricing_policy",
    "tone_of_voice",
    "competitors",
    "key_facts",
    "brand_visual_style",
)

_LABELS: Dict[str, str] = {
    "mission": "Миссия/позиционирование",
    "target_audience": "Целевая аудитория",
    "usp": "УТП (чем отличаемся от конкурентов)",
    "pricing_policy": "Ценовая политика",
    "tone_of_voice": "Тон общения / голос бренда",
    "competitors": "Конкуренты и отличия от них",
    "key_facts": "Прочие важные факты о бизнесе",
    "brand_visual_style": "Визуальный стиль бренда (палитра, стиль иллюстраций, чего избегать)",
}


def get_or_create(db: Session) -> AcademyBusinessProfile:
    profile = db.query(AcademyBusinessProfile).order_by(AcademyBusinessProfile.id).first()
    if profile is None:
        profile = AcademyBusinessProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def update(
    db: Session, profile: AcademyBusinessProfile, updates: Dict[str, Any], *, user_id: Optional[int] = None
) -> AcademyBusinessProfile:
    for field, value in updates.items():
        if field in FIELDS:
            setattr(profile, field, value)
    profile.updated_by_id = user_id
    db.commit()
    db.refresh(profile)
    return profile


def as_prompt_block(profile: AcademyBusinessProfile) -> str:
    """Форматирует заполненные поля профиля в блок для системного промпта.
    Пустая строка, если профиль вообще не заполнен (ничего лишнего в контекст)."""
    lines = []
    for field in FIELDS:
        value = (getattr(profile, field, None) or "").strip()
        if value:
            lines.append(f"{_LABELS[field]}: {value}")
    if not lines:
        return ""
    return "=== ПРОФИЛЬ АКАДЕМИИ (заполнено владельцем, всегда достоверно) ===\n" + "\n".join(lines)


def brand_visual_style(profile: AcademyBusinessProfile) -> str:
    """Только визуальный бренд-гайд — используется при рендере картинки, чтобы
    держать её в едином стиле независимо от того, как был написан image_prompt
    (сгенерирован моделью или отредактирован человеком вручную)."""
    return (getattr(profile, "brand_visual_style", None) or "").strip()
