"""Планировщик регулярной генерации постов.

По правилу (academy_schedule_rules) с заданной периодичностью (cron-выражение)
готовит черновики «текст + промпт картинки» и кладёт в очередь
academy_content_drafts. Ничего не публикует — только черновики на проверку
человеком (см. §3.5 концепции).
"""
from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AcademyScheduleRule, User
from app.services.academy_ai import content_gen

_DEFAULT_TOPICS = [
    "польза направления для ученика и родителя",
    "результаты и кейсы учеников",
    "как проходят занятия",
    "ответ на частый вопрос клиента",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def next_run_from_cadence(cadence: str, *, after: Optional[datetime] = None) -> Optional[datetime]:
    """Следующее время срабатывания по cron-выражению (5 полей). None, если
    выражение не разобрать."""
    after = after or _now()
    try:
        from apscheduler.triggers.cron import CronTrigger

        trigger = CronTrigger.from_crontab((cadence or "").strip(), timezone=timezone.utc)
        return trigger.get_next_fire_time(None, after)
    except Exception:  # noqa: BLE001
        return None


def _pick_direction(rule: AcademyScheduleRule) -> Optional[str]:
    proportions = rule.proportions if isinstance(rule.proportions, dict) else {}
    weighted = [(k, float(v)) for k, v in proportions.items() if _positive(v)]
    if not weighted:
        return None
    directions, weights = zip(*weighted)
    return random.choices(list(directions), weights=list(weights), k=1)[0]


def _positive(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def _pick_topic(rule: AcademyScheduleRule) -> str:
    topics = [str(t).strip() for t in (rule.topics or []) if str(t).strip()] or _DEFAULT_TOPICS
    return random.choice(topics)


def due_rules(db: Session, *, now: Optional[datetime] = None, limit: int = 10) -> List[AcademyScheduleRule]:
    now = now or _now()
    return (
        db.query(AcademyScheduleRule)
        .filter(
            AcademyScheduleRule.is_active.is_(True),
            (AcademyScheduleRule.next_run_at.is_(None)) | (AcademyScheduleRule.next_run_at <= now),
        )
        .order_by(AcademyScheduleRule.next_run_at.asc().nullsfirst())
        .limit(limit)
        .all()
    )


async def run_rule(db: Session, rule: AcademyScheduleRule, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or _now()
    creator = db.query(User).filter(User.id == rule.created_by_id).first() if rule.created_by_id else None
    if creator is not None and not getattr(creator, "is_active", True):
        creator = None

    direction = _pick_direction(rule)
    topic = _pick_topic(rule)
    brief = f"{rule.name}: {topic}"

    draft = await content_gen.generate(
        db,
        creator,
        kind="post",
        brief=brief,
        direction=direction,
        tone=rule.tone if isinstance(rule.tone, dict) else None,
        schedule_rule_id=rule.id,
    )

    rule.next_run_at = next_run_from_cadence(rule.cadence, after=now)
    db.commit()
    return {"rule_id": rule.id, "draft_id": draft.id, "direction": direction, "next_run_at": rule.next_run_at}


async def dispatch_due_rules(db: Session, *, now: Optional[datetime] = None, limit: int = 5) -> Dict[str, Any]:
    now = now or _now()
    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for rule in due_rules(db, now=now, limit=limit):
        try:
            results.append(await run_rule(db, rule, now=now))
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            errors.append({"rule_id": rule.id, "error": str(exc)})
            # чтобы «битое» правило не крутилось в цикле — сдвигаем next_run_at
            rule.next_run_at = next_run_from_cadence(rule.cadence, after=now)
            db.commit()
    return {"generated": len(results), "drafts": results, "errors": errors}
