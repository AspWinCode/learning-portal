"""Контент-план проекта — с опциональной периодичностью (п. запроса
пользователя: «создаём контент-план и далее периодичность — и система
начинает работать»).

Без periodicity план работает только вручную (add_item/generate_items —
AI предлагает идеи, человек сам решает, что дорастить до публикации).

С periodicity ({"unit": "day"|"week", "times": N, "channels": [...],
"auto_publish": bool}) план — живой: ensure_plan_scheduled() регулярно (из
run_smm_plan_generation, см. app.background_jobs) подкладывает новые пункты
на горизонт планирования и сразу материализует их в SmmContent + SmmPublication
(scheduled). Включение periodicity — это и есть то самое явное решение
человека, которое запускает автоматизацию; дальше публикация идёт по времени
без дополнительного клика."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import SmmContentPlan, SmmContentPlanItem, SmmContentPlanItemStatus, SmmContentStatus, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import generation
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import prompt_builder
from app.services.smm_projects import publishing as publishing_svc
from app.services.smm_projects import templates as templates_svc

PLAN_ITEM_STATUSES = tuple(s.value for s in SmmContentPlanItemStatus)
MAX_ITEMS_PER_RUN = 20


def create_plan(
    db: Session, project: SmmProject, user, *, name: str, date_from: Optional[date] = None,
    date_to: Optional[date] = None, periodicity: Optional[Dict[str, Any]] = None,
) -> SmmContentPlan:
    plan = SmmContentPlan(
        project_id=project.id, name=name, date_from=date_from, date_to=date_to, periodicity=periodicity,
        created_by_id=getattr(user, "id", None),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def list_plans(db: Session, project: SmmProject) -> List[SmmContentPlan]:
    return db.query(SmmContentPlan).filter(SmmContentPlan.project_id == project.id).order_by(SmmContentPlan.created_at.desc()).all()


def get_plan(db: Session, project: SmmProject, plan_id: int) -> Optional[SmmContentPlan]:
    return db.query(SmmContentPlan).filter(SmmContentPlan.id == plan_id, SmmContentPlan.project_id == project.id).first()


def update_plan(db: Session, plan: SmmContentPlan, updates: Dict[str, Any]) -> SmmContentPlan:
    for field in ("name", "date_from", "date_to", "periodicity", "is_active"):
        if field in updates and updates[field] is not None:
            setattr(plan, field, updates[field])
    db.commit()
    db.refresh(plan)
    return plan


def add_item(db: Session, plan: SmmContentPlan, data: Dict[str, Any]) -> SmmContentPlanItem:
    item = SmmContentPlanItem(
        plan_id=plan.id, scheduled_at=data.get("scheduled_at"), channel=data.get("channel"),
        content_type=data.get("content_type"), title=data["title"], brief=data.get("brief"),
        status=data.get("status") or SmmContentPlanItemStatus.PENDING.value,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item: SmmContentPlanItem, updates: Dict[str, Any]) -> SmmContentPlanItem:
    if "status" in updates and updates["status"] is not None and updates["status"] not in PLAN_ITEM_STATUSES:
        raise ValueError(f"Недопустимый статус. Доступны: {', '.join(PLAN_ITEM_STATUSES)}")
    for field in ("scheduled_at", "channel", "content_type", "title", "brief", "status", "generated_content_id"):
        if field in updates and updates[field] is not None:
            setattr(item, field, updates[field])
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: SmmContentPlanItem) -> None:
    db.delete(item)
    db.commit()


def _parse_plan_items(raw: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ValueError("AI вернул не JSON-объект для контент-плана")
    items = raw.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("В ответе AI нет непустого списка items")
    parsed = []
    for row in items:
        if not isinstance(row, dict) or not str(row.get("topic") or row.get("title") or "").strip():
            continue
        scheduled_at = None
        raw_date = row.get("date") or row.get("scheduled_at")
        if isinstance(raw_date, str) and raw_date.strip():
            try:
                scheduled_at = datetime.strptime(raw_date.strip()[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                scheduled_at = None
        parsed.append({
            "scheduled_at": scheduled_at,
            "channel": row.get("channel"),
            "content_type": row.get("goal") or row.get("content_type"),
            "title": str(row.get("topic") or row.get("title")).strip()[:256],
            "brief": row.get("brief") or row.get("тезис"),
        })
    if not parsed:
        raise ValueError("Ни один пункт плана от AI не прошёл валидацию")
    return parsed


async def generate_items(
    db: Session, user, *, project: SmmProject, plan: SmmContentPlan, count: int, channels: List[str],
    goals: Optional[str] = None, important_events: Optional[str] = None,
) -> List[SmmContentPlanItem]:
    """AI-ассистированное ручное заполнение плана идеями (не привязано к
    periodicity — это просто мозговой штурм, который человек потом сам
    дорастит до публикаций)."""
    if not ai_gateway.is_configured("text"):
        raise ValueError("AI Tunnel не настроен — контент-план нельзя сгенерировать автоматически")

    knowledge_hits = await knowledge_svc.search(db, project, f"{goals or ''} {important_events or ''}".strip())
    system_prompt = prompt_builder.build_system_prompt(project, None, knowledge_hits)
    system_prompt += (
        "\n\nВерни ТОЛЬКО JSON без markdown: "
        '{"items":[{"date":"YYYY-MM-DD","channel":"vk|telegram|instagram|max",'
        '"topic":"...","goal":"...","brief":"..."}]}. '
        "Если точная дата неизвестна — распредели равномерно по периоду."
    )
    period = f"{plan.date_from.isoformat() if plan.date_from else '—'} — {plan.date_to.isoformat() if plan.date_to else '—'}"
    user_prompt = (
        f"Составь контент-план на период {period}. Количество публикаций: {count}. "
        f"Каналы: {', '.join(channels) or 'любые подходящие'}. "
        f"Цели: {goals or '—'}. Важные события в периоде: {important_events or '—'}."
    )

    result = await ai_gateway.complete_text(
        feature=f"smm_projects:{project.code}:content_plan", system=system_prompt, prompt=user_prompt,
        json_mode=True, temperature=0.5, max_tokens=1800, user_id=getattr(user, "id", None),
    )
    if not result.ok or not result.text:
        raise ValueError(result.error or "AI не вернул ответ")

    parsed_items = _parse_plan_items(result.json_object())
    return [add_item(db, plan, row) for row in parsed_items[:count]]


def _cadence_interval(periodicity: Dict[str, Any]) -> timedelta:
    unit = periodicity.get("unit", "week")
    times = max(int(periodicity.get("times") or 1), 1)
    span = timedelta(days=7) if unit == "week" else timedelta(days=1)
    return span / times


async def _materialize_item(
    db: Session, user, *, project: SmmProject, item: SmmContentPlanItem, auto_publish: bool,
) -> None:
    template = templates_svc.get_by_code(db, project, "social_post")
    if template is None:
        active = templates_svc.list_templates(db, project)
        template = active[0] if active else None
    if template is None:
        item.status, item.last_error = SmmContentPlanItemStatus.ERROR.value, "В проекте нет активных шаблонов"
        db.commit()
        return

    item.status = SmmContentPlanItemStatus.GENERATING.value
    db.commit()

    input_data = {
        "topic": item.brief or item.title,
        "platform": item.channel or "universal",
        "goal": item.content_type or "регулярная публикация",
    }
    try:
        content = await generation.generate(db, user, project=project, template=template, input_data=input_data, auto_generated=True)
    except ValueError as exc:
        item.status, item.last_error = SmmContentPlanItemStatus.ERROR.value, str(exc)
        db.commit()
        return

    item.generated_content_id = content.id
    item.status = SmmContentPlanItemStatus.READY.value
    db.commit()

    if not auto_publish or not item.channel:
        return

    content.status = SmmContentStatus.APPROVED.value
    db.commit()
    try:
        publishing_svc.create_publications(
            db, user, project=project,
            items=[{"channel": item.channel, "content_id": content.id, "asset_id": None}],
            publish_at=item.scheduled_at,
        )
        item.status = SmmContentPlanItemStatus.PUBLISHING.value if not item.scheduled_at else SmmContentPlanItemStatus.READY.value
    except ValueError as exc:
        item.status, item.last_error = SmmContentPlanItemStatus.ERROR.value, str(exc)
    db.commit()


async def ensure_plan_scheduled(db: Session, user, project: SmmProject, plan: SmmContentPlan) -> List[SmmContentPlanItem]:
    """Подкладывает новые пункты плана на горизонт планирования по заданной
    periodicity и сразу материализует их (генерация + постановка в очередь
    публикации). Вызывается периодической задачей — см. background_jobs."""
    periodicity = plan.periodicity or {}
    if not plan.is_active or not periodicity.get("times"):
        return []

    channels = [c for c in (periodicity.get("channels") or []) if c] or ["vk"]
    lookahead_days = int(periodicity.get("lookahead_days") or 14)
    auto_publish = bool(periodicity.get("auto_publish", True))
    interval = _cadence_interval(periodicity)

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=lookahead_days)

    last_item = (
        db.query(SmmContentPlanItem)
        .filter(SmmContentPlanItem.plan_id == plan.id, SmmContentPlanItem.scheduled_at.isnot(None))
        .order_by(SmmContentPlanItem.scheduled_at.desc())
        .first()
    )
    next_time = (last_item.scheduled_at + interval) if last_item and last_item.scheduled_at else now + interval

    created: List[SmmContentPlanItem] = []
    i = 0
    while next_time <= horizon and i < MAX_ITEMS_PER_RUN:
        channel = channels[i % len(channels)]
        item = SmmContentPlanItem(
            plan_id=plan.id, scheduled_at=next_time, channel=channel,
            content_type=periodicity.get("goal") or "регулярная публикация",
            title=f"Автопост {next_time.date().isoformat()} ({channel})",
            brief=periodicity.get("brief") or periodicity.get("goals"),
            status=SmmContentPlanItemStatus.PENDING.value,
        )
        db.add(item)
        created.append(item)
        next_time += interval
        i += 1

    if not created:
        return []

    db.commit()
    for item in created:
        db.refresh(item)

    plan.last_generated_at = now
    db.commit()

    for item in created:
        await _materialize_item(db, user, project=project, item=item, auto_publish=auto_publish)

    return created


async def run_due_plans(db: Session) -> Dict[str, int]:
    """Фоновая задача (см. app.background_jobs.run_smm_plan_generation):
    проходит все активные планы с заданной periodicity и подкладывает новые
    пункты на горизонт планирования. Атрибуция автогенерации — пользователь,
    который включил periodicity (plan.created_by_id); полноценный User не
    нужен, generation/publishing используют только user.id."""
    plans = (
        db.query(SmmContentPlan)
        .filter(SmmContentPlan.is_active.is_(True))
        .all()
    )
    processed = 0
    items_created = 0
    for plan in plans:
        periodicity = plan.periodicity or {}
        if not periodicity.get("times"):
            continue
        project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
        if project is None or not project.is_active:
            continue
        user = SimpleNamespace(id=plan.created_by_id)
        created = await ensure_plan_scheduled(db, user, project, plan)
        processed += 1
        items_created += len(created)
    return {"plans_checked": processed, "items_created": items_created}
