"""CRUD поверх AiWorkspace + бренд-профиль.

brand_context — произвольный JSON-словарь полей бренд-профиля (см.
BRAND_CONTEXT_FIELDS: официальное название, аудитория, tone of voice,
запрещённые формулировки и т.п.). Phase 1 не валидирует его схему жёстко —
owner заполняет через форму на фронтенде, сюда долетает уже готовый dict.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AiWorkspace

# Подсказка фронтенду, какие поля бренд-профиля предлагать в форме настроек
# направления (п.3 ТЗ). Поля не обязательны — пустые просто не попадают в промпт.
BRAND_CONTEXT_FIELDS: List[Dict[str, str]] = [
    {"key": "official_name", "label": "Официальное название"},
    {"key": "short_description", "label": "Краткое описание проекта"},
    {"key": "target_audience", "label": "Целевая аудитория"},
    {"key": "age_range", "label": "Возраст аудитории"},
    {"key": "directions", "label": "Направления"},
    {"key": "advantages", "label": "Преимущества"},
    {"key": "key_messages", "label": "Ключевые сообщения"},
    {"key": "forbidden_phrasing", "label": "Запрещённые формулировки"},
    {"key": "contacts", "label": "Контакты"},
    {"key": "links", "label": "Ссылки"},
    {"key": "cta", "label": "Типовой CTA"},
    {"key": "typical_events", "label": "Типовые мероприятия"},
    {"key": "geography", "label": "География"},
    {"key": "work_formats", "label": "Форматы работы"},
    {"key": "comms_with_kids", "label": "Коммуникация с детьми"},
    {"key": "comms_with_parents", "label": "Коммуникация с родителями"},
    {"key": "comms_with_partners", "label": "Коммуникация со школами/партнёрами"},
]


def list_workspaces(db: Session, *, active_only: bool = True) -> List[AiWorkspace]:
    q = db.query(AiWorkspace)
    if active_only:
        q = q.filter(AiWorkspace.is_active.is_(True))
    return q.order_by(AiWorkspace.id).all()


def get_by_code(db: Session, code: str) -> Optional[AiWorkspace]:
    return db.query(AiWorkspace).filter(AiWorkspace.code == code).first()


def update_workspace(db: Session, workspace: AiWorkspace, updates: Dict[str, Any]) -> AiWorkspace:
    for field in ("name", "description", "system_prompt", "tone_of_voice", "audience_description", "default_language", "is_active"):
        if field in updates and updates[field] is not None:
            setattr(workspace, field, updates[field])
    if "brand_context" in updates and updates["brand_context"] is not None:
        workspace.brand_context = updates["brand_context"]
    db.commit()
    db.refresh(workspace)
    return workspace
