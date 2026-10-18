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
        content_type = str(row.get("goal") or row.get("content_type") or "").strip()
        parsed.append({
            "scheduled_at": scheduled_at,
            "channel": row.get("channel"),
            # content_type — String(64); AI иногда пишет развёрнутую цель вместо
            # короткой категории, усечение — защита от StringDataRightTruncation.
            "content_type": content_type[:64] or None,
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
        "\n\nЭто план-брейншторм ТЕМ, а не готовые посты. Верни ТОЛЬКО JSON без markdown, "
        "строго по схеме: "
        '{"items":[{"date":"YYYY-MM-DD","channel":"vk|telegram|instagram|max",'
        '"topic":"...","goal":"...","brief":"..."}]}. '
        "В каждом пункте — ровно один объект на ОДНУ публикацию в ОДНОМ канале (не группируй "
        "несколько каналов внутри одного пункта и не добавляй вложенные объекты по каналам). "
        "topic — заголовок темы, не более 12 слов. goal — короткая категория поста "
        "(2-4 слова, например «анонс регистрации», «обучающий разбор», «вовлечение», "
        "«итоги недели»), НЕ разворачивай её в предложение. brief — краткий тезис/бриф для "
        "автора поста, не более 30 слов. НЕ пиши готовый текст поста, не используй эмодзи и "
        "переносы строк внутри полей — это бриф для дальнейшей генерации, а не финальный контент. "
        "Если точная дата неизвестна — распредели равномерно по периоду."
    )
    period = f"{plan.date_from.isoformat() if plan.date_from else '—'} — {plan.date_to.isoformat() if plan.date_to else '—'}"
    user_prompt = (
        f"Составь контент-план на период {period}. Количество публикаций: {count}. "
        f"Каналы: {', '.join(channels) or 'любые подходящие'}. "
        f"Цели: {goals or '—'}. Важные события в периоде: {important_events or '—'}."
    )

    # max_tokens с запасом: даже если модель проигнорирует лимит длины полей,
    # count*4 полей по ~60 токенов на компактный пункт плана должно хватать
    # с кратным запасом, чтобы обрезка JSON на середине ответа не повторилась.
    result = await ai_gateway.complete_text(
        feature=f"smm_projects:{project.code}:content_plan", system=system_prompt, prompt=user_prompt,
        json_mode=True, temperature=0.5, max_tokens=max(1800, count * 220), user_id=getattr(user, "id", None),
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


# Россия не переходит на летнее/зимнее время с 2014 года — фиксированный UTC+3
# без учёта DST достаточен для времени публикации по МСК.
_MSK_OFFSET = timedelta(hours=3)


def _parse_time_of_day(value: Optional[str]) -> tuple[int, int]:
    raw = str(value or "10:00").strip()
    try:
        hh, mm = raw.split(":")[:2]
        hour, minute = int(hh), int(mm)
    except (ValueError, IndexError):
        hour, minute = 10, 0
    return max(0, min(hour, 23)), max(0, min(minute, 59))


def _msk_to_utc(day: date, hour: int, minute: int) -> datetime:
    local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=timezone.utc) - _MSK_OFFSET
    return local


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

    # prompt_template.format(**input_data) требует значение под КАЖДЫЙ {placeholder}
    # схемы шаблона — если автопилот знает только часть полей (topic/platform/goal),
    # формат падает KeyError на первом отсутствующем ключе ("не хватает поля
    # «audience»"). Предзаполняем все поля схемы пустой строкой (prompt_builder
    # сам подставит "—" для пустых), затем перекрываем тем, что знаем реально.
    schema_fields = (template.input_schema_json or {}).get("fields", [])
    input_data: Dict[str, Any] = {f["key"]: "" for f in schema_fields if f.get("key")}
    input_data.update({
        "topic": item.brief or item.title,
        "platform": item.channel or "universal",
        "goal": item.content_type or "регулярная публикация",
    })
    brand = project.brand_context or {}
    if "audience" in input_data and not input_data["audience"]:
        input_data["audience"] = brand.get("target_audience") or ""
    if "cta" in input_data and not input_data["cta"]:
        input_data["cta"] = brand.get("cta") or ""
    if "length" in input_data and not input_data["length"]:
        input_data["length"] = "средний"
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
    публикации). Вызывается периодической задачей — см. background_jobs.

    Два режима periodicity:
    - rotate (по умолчанию, обратная совместимость): "unit"+"times" — посты
      по очереди, один канал за раз, через равный интервал.
    - burst ("mode": "burst", "cadence_days": N, "time_of_day": "HH:MM" по
      МСК): все каналы публикуются ОДНОВРЕМЕННО, раз в N дней, в заданное
      время — раз пользователь просил «разом на всех площадках в 10:00»."""
    periodicity = plan.periodicity or {}
    burst = periodicity.get("mode") == "burst"
    if not plan.is_active or not (periodicity.get("times") or burst):
        return []

    channels = [c for c in (periodicity.get("channels") or []) if c] or ["vk"]
    lookahead_days = int(periodicity.get("lookahead_days") or 14)
    auto_publish = bool(periodicity.get("auto_publish", True))

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=lookahead_days)

    last_item = (
        db.query(SmmContentPlanItem)
        .filter(SmmContentPlanItem.plan_id == plan.id, SmmContentPlanItem.scheduled_at.isnot(None))
        .order_by(SmmContentPlanItem.scheduled_at.desc())
        .first()
    )

    created: List[SmmContentPlanItem] = []

    if burst:
        cadence = timedelta(days=max(int(periodicity.get("cadence_days") or 3), 1))
        hour, minute = _parse_time_of_day(periodicity.get("time_of_day"))
        if last_item and last_item.scheduled_at:
            next_day = (last_item.scheduled_at + cadence).date()
        else:
            next_day = now.date() + timedelta(days=1)
        next_time = _msk_to_utc(next_day, hour, minute)
        while next_time <= horizon and len(created) + len(channels) <= MAX_ITEMS_PER_RUN:
            for channel in channels:
                item = SmmContentPlanItem(
                    plan_id=plan.id, scheduled_at=next_time, channel=channel,
                    content_type=periodicity.get("goal") or "регулярная публикация",
                    title=f"Автопост {next_time.date().isoformat()} ({channel})",
                    brief=periodicity.get("brief") or periodicity.get("goals"),
                    status=SmmContentPlanItemStatus.PENDING.value,
                )
                db.add(item)
                created.append(item)
            next_day += cadence
            next_time = _msk_to_utc(next_day, hour, minute)
    else:
        interval = _cadence_interval(periodicity)
        next_time = (last_item.scheduled_at + interval) if last_item and last_item.scheduled_at else now + interval
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
