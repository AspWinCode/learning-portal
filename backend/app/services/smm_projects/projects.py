"""CRUD поверх SmmProject + бренд/контекстный профиль.

brand_context — произвольный JSON-словарь (см. BRAND_CONTEXT_FIELDS). Схема
не валидируется жёстко — owner заполняет через форму на фронтенде."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import SmmProject

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
    {"key": "visual_palette", "label": "Визуальная палитра"},
    {"key": "visual_style", "label": "Визуальный стиль"},
    {"key": "logo_usage", "label": "Использование логотипа"},
    {"key": "allowed_imagery", "label": "Разрешённые образы"},
    {"key": "forbidden_imagery", "label": "Запрещённые образы"},
    {"key": "people_style", "label": "Стиль изображения людей"},
    {"key": "image_composition", "label": "Композиция изображения"},
]

_CYRILLIC_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _transliterate(value: str) -> str:
    return "".join(_CYRILLIC_TRANSLIT.get(ch, ch) for ch in value.lower())


def _slugify(name: str) -> str:
    # code используется как суффикс env-переменных (SMM_VK_TOKEN_<CODE>) —
    # дефисы там недопустимы, поэтому разделитель "_", а не "-".
    base = _SLUG_RE.sub("_", _transliterate(name)).strip("_") or "project"
    return base[:48]


def list_projects(db: Session, *, active_only: bool = True) -> List[SmmProject]:
    q = db.query(SmmProject)
    if active_only:
        q = q.filter(SmmProject.is_active.is_(True))
    return q.order_by(SmmProject.id).all()


def get_by_code(db: Session, code: str) -> Optional[SmmProject]:
    return db.query(SmmProject).filter(SmmProject.code == code).first()


def create_project(db: Session, user, *, name: str, description: Optional[str] = None) -> SmmProject:
    base_code = _slugify(name)
    code = base_code
    suffix = 1
    while db.query(SmmProject).filter(SmmProject.code == code).first() is not None:
        suffix += 1
        code = f"{base_code}_{suffix}" if suffix > 1 else f"{base_code}_{uuid4().hex[:4]}"
    project = SmmProject(code=code, name=name, description=description, created_by_id=getattr(user, "id", None))
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project: SmmProject, updates: Dict[str, Any]) -> SmmProject:
    for field in ("name", "description", "system_prompt", "tone_of_voice", "audience_description", "default_language", "is_active"):
        if field in updates and updates[field] is not None:
            setattr(project, field, updates[field])
    if "brand_context" in updates and updates["brand_context"] is not None:
        project.brand_context = updates["brand_context"]
    db.commit()
    db.refresh(project)
    return project
