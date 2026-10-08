from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import SmmContentTemplate, SmmProject


def list_templates(db: Session, project: SmmProject, *, active_only: bool = True) -> List[SmmContentTemplate]:
    q = db.query(SmmContentTemplate).filter(SmmContentTemplate.project_id == project.id)
    if active_only:
        q = q.filter(SmmContentTemplate.is_active.is_(True))
    return q.order_by(SmmContentTemplate.sort_order, SmmContentTemplate.id).all()


def get_by_code(db: Session, project: SmmProject, code: str) -> Optional[SmmContentTemplate]:
    return (
        db.query(SmmContentTemplate)
        .filter(SmmContentTemplate.project_id == project.id, SmmContentTemplate.code == code)
        .first()
    )


DEFAULT_TEMPLATES = [
    {
        "code": "social_post",
        "name": "Пост для соцсетей",
        "description": "Пост под тему и цель.",
        "prompt_template": (
            "Напиши пост для соцсети. Площадка: {platform}. Аудитория: {audience}. Цель: {goal}. "
            "CTA: {cta}. Длина: {length}.\n\nТема и факты: {topic}"
        ),
        "input_schema_json": {
            "fields": [
                {"key": "topic", "label": "Тема", "type": "text", "required": True},
                {"key": "goal", "label": "Цель", "type": "text"},
                {"key": "platform", "label": "Площадка", "type": "select", "options": ["vk", "telegram", "instagram", "max", "universal"]},
                {"key": "audience", "label": "Аудитория", "type": "text"},
                {"key": "cta", "label": "CTA", "type": "text"},
                {"key": "length", "label": "Длина", "type": "select", "options": ["короткий", "средний", "длинный"]},
            ]
        },
        "output_format": "json",
        "sort_order": 10,
    },
    {
        "code": "event_announcement",
        "name": "Анонс мероприятия",
        "description": "Анонс события: дата, место, возраст, формат, стоимость, CTA.",
        "prompt_template": (
            "Составь анонс мероприятия. Название: {title}. Дата: {date}. Время: {time}. Место: {location}. "
            "Возраст: {age}. Формат: {format}. Стоимость: {price}. Ссылка: {link}. CTA: {cta}.\n\n"
            "Если какого-то факта нет — напиши [уточнить ...], не придумывай."
        ),
        "input_schema_json": {
            "fields": [
                {"key": "title", "label": "Название", "type": "text", "required": True},
                {"key": "date", "label": "Дата", "type": "text"},
                {"key": "time", "label": "Время", "type": "text"},
                {"key": "location", "label": "Место", "type": "text"},
                {"key": "age", "label": "Возраст", "type": "text"},
                {"key": "format", "label": "Формат", "type": "text"},
                {"key": "price", "label": "Стоимость", "type": "text"},
                {"key": "link", "label": "Ссылка", "type": "text"},
                {"key": "cta", "label": "CTA", "type": "text"},
            ]
        },
        "output_format": "json",
        "sort_order": 20,
    },
    {
        "code": "email",
        "name": "Email / рассылка",
        "description": "Письмо родителям/участникам/школам/партнёрам.",
        "prompt_template": (
            "Напиши письмо для рассылки. Адресат: {audience_type}. Тема письма: {topic}. "
            "Ключевые факты: {facts}. CTA: {cta}."
        ),
        "input_schema_json": {
            "fields": [
                {"key": "audience_type", "label": "Адресат", "type": "select",
                 "options": ["parents", "participants", "schools", "partners", "prospects"], "required": True},
                {"key": "topic", "label": "Тема письма", "type": "text", "required": True},
                {"key": "facts", "label": "Ключевые факты", "type": "text"},
                {"key": "cta", "label": "CTA", "type": "text"},
            ]
        },
        "output_format": "json",
        "sort_order": 30,
    },
]


def seed_defaults(db: Session, project: SmmProject) -> List[SmmContentTemplate]:
    """Создаёт стартовый набор шаблонов для нового проекта (owner может
    редактировать/удалять/добавлять свои — без правки backend-кода)."""
    created = []
    for spec in DEFAULT_TEMPLATES:
        if get_by_code(db, project, spec["code"]):
            continue
        row = SmmContentTemplate(project_id=project.id, **spec)
        db.add(row)
        created.append(row)
    if created:
        db.commit()
        for row in created:
            db.refresh(row)
    return created
