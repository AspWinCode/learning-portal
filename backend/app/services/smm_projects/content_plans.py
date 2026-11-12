"""AI-assisted editorial plans for SMM projects."""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy.orm import Session, joinedload

from app.models import SmmContentPlan, SmmContentPlanItem, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects.prompt_builder import GLOBAL_SAFETY_RULES, _brand_block

DEFAULT_FORMATS = ["Пост", "Карточка", "Карусель", "Видео / Reels / Shorts", "Инфографика"]


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def list_plans(db: Session, project: SmmProject) -> List[SmmContentPlan]:
    return (
        db.query(SmmContentPlan)
        .options(joinedload(SmmContentPlan.items))
        .filter(SmmContentPlan.project_id == project.id)
        .order_by(SmmContentPlan.date_from.desc(), SmmContentPlan.id.desc())
        .all()
    )


def get_plan(db: Session, project: SmmProject, plan_id: int) -> SmmContentPlan | None:
    return (
        db.query(SmmContentPlan)
        .options(joinedload(SmmContentPlan.items))
        .filter(SmmContentPlan.project_id == project.id, SmmContentPlan.id == plan_id)
        .first()
    )


def _fallback_items(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    start = _as_date(payload["date_from"])
    end = _as_date(payload["date_to"])
    formats = payload.get("formats") or DEFAULT_FORMATS
    rows: List[Dict[str, Any]] = []
    current = start
    step = max(1, round(7 / max(1, int(payload.get("posts_per_week") or 3))))
    i = 0
    while current <= end:
        rows.append({
            "date": current.isoformat(),
            "rubric": "Тема недели",
            "title": f"Контент по теме проекта №{i + 1}",
            "brief": "Раскрыть тему через факты из базы знаний проекта; неподтверждённые детали пометить для уточнения.",
            "retention_mechanic": "Вопрос аудитории в конце публикации",
            "format": formats[i % len(formats)],
            "channel": (payload.get("channels") or [None])[i % len(payload.get("channels") or [None])],
        })
        current += timedelta(days=step)
        i += 1
    return rows


def _parse_json(raw: str, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    text = (raw or "").strip().replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(text)
        items = data.get("items", data) if isinstance(data, dict) else data
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    except (TypeError, ValueError, AttributeError):
        pass
    return fallback


async def generate_plan(db: Session, user, *, project: SmmProject, payload: Dict[str, Any]) -> SmmContentPlan:
    start = _as_date(payload["date_from"])
    end = _as_date(payload["date_to"])
    if end < start:
        raise ValueError("Дата окончания не может быть раньше даты начала")
    if (end - start).days > 62:
        raise ValueError("Контент-план можно создавать максимум на 2 месяца")

    query = " ".join(str(payload.get(key) or "") for key in ("objective", "audience", "extra_context"))
    # Контекст плана должен быть постоянным и полным: при генерации месячного
    # плана читаем все активные факты/файлы проекта, а не только совпадения по
    # короткому запросу формы.
    hits = knowledge_svc.list_items(db, project)
    knowledge = knowledge_svc.as_prompt_block(hits)
    fallback = _fallback_items(payload)
    requested_formats = payload.get("formats") or DEFAULT_FORMATS
    system = "\n\n".join(part for part in [GLOBAL_SAFETY_RULES, _brand_block(project), knowledge, (
        "Ты — SMM-планер. Составляй только редакционный план, не готовые тексты. "
        "Опирайся на контекст проекта и не выдумывай факты. Верни ТОЛЬКО JSON вида "
        '{"items":[{"date":"YYYY-MM-DD","rubric":"...","title":"...",'
        '"brief":"...","retention_mechanic":"...","format":"...","channel":"..."}]}.'
    )] if part)
    prompt = (
        f"Период: {start.isoformat()} — {end.isoformat()}.\n"
        f"Цель: {payload.get('objective') or 'вовлечение и рост доверия'}.\n"
        f"Аудитория: {payload.get('audience') or 'аудитория проекта'}.\n"
        f"Каналы: {', '.join(payload.get('channels') or ['универсальный'])}.\n"
        f"Предпочтительные форматы: {', '.join(requested_formats)}.\n"
        f"Публикаций в неделю: {payload.get('posts_per_week')}.\n"
        f"Дополнительный контекст: {payload.get('extra_context') or 'нет'}.\n"
        "Сделай равномерный план на весь период. Свяжи повторяющиеся форматы в серии, "
        "добавляй механику удержания и не называй характеристику продукта, которой нет в контексте."
    )
    raw = ""
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=f"smm_projects:{project.code}:content_plan",
            system=system,
            prompt=prompt,
            json_mode=True,
            temperature=0.55,
            max_tokens=4000,
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            raw = result.text
    items_data = _parse_json(raw, fallback)
    plan = SmmContentPlan(
        project_id=project.id,
        name=f"Контент-план: {start.strftime('%d.%m.%Y')} — {end.strftime('%d.%m.%Y')}",
        date_from=start,
        date_to=end,
        objective=payload.get("objective"),
        audience=payload.get("audience"),
        channels=payload.get("channels") or [],
        formats=requested_formats,
        posts_per_week=payload.get("posts_per_week") or 3,
        created_by_id=getattr(user, "id", None),
    )
    db.add(plan)
    db.flush()
    for position, item in enumerate(items_data):
        try:
            item_date = date.fromisoformat(str(item.get("date")))
        except (TypeError, ValueError):
            item_date = start + timedelta(days=min(position * 2, (end - start).days))
        item_date = max(start, min(end, item_date))
        db.add(SmmContentPlanItem(
            plan_id=plan.id,
            publish_date=item_date,
            position=position,
            rubric=str(item.get("rubric") or "").strip()[:256] or None,
            title=str(item.get("title") or "Тема публикации").strip()[:256],
            brief=str(item.get("brief") or "").strip() or None,
            retention_mechanic=str(item.get("retention_mechanic") or "").strip() or None,
            content_format=str(item.get("format") or "Пост").strip()[:128],
            channel=str(item.get("channel") or "").strip()[:32] or None,
        ))
    db.commit()
    return get_plan(db, project, plan.id)  # type: ignore[return-value]
