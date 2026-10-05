"""Контент-план направления (п.11 ТЗ).

Сам план — контейнер с периодом; AI заполняет его идеями (status=idea), а
превращение идеи в реальный материал — отдельный шаг через generation.generate
(человек решает, когда и что из плана дорастить до черновика). generate_items
просит у AI строго JSON {"items": [...]}, который валидируется перед записью —
невалидный/неполный ответ не создаёт мусорные строки, а поднимает ValueError.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AiContentPlan, AiContentPlanItem, AiContentPlanItemStatus, AiWorkspace
from app.services import ai_gateway
from app.services.ai_studio import knowledge as knowledge_svc
from app.services.ai_studio import prompt_builder

PLAN_ITEM_STATUSES = tuple(s.value for s in AiContentPlanItemStatus)


def create_plan(
    db: Session,
    workspace: AiWorkspace,
    user,
    *,
    name: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> AiContentPlan:
    plan = AiContentPlan(
        workspace_id=workspace.id,
        name=name,
        date_from=date_from,
        date_to=date_to,
        created_by_id=getattr(user, "id", None),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def list_plans(db: Session, workspace: AiWorkspace) -> List[AiContentPlan]:
    return (
        db.query(AiContentPlan)
        .filter(AiContentPlan.workspace_id == workspace.id)
        .order_by(AiContentPlan.created_at.desc())
        .all()
    )


def get_plan(db: Session, workspace: AiWorkspace, plan_id: int) -> Optional[AiContentPlan]:
    return (
        db.query(AiContentPlan)
        .filter(AiContentPlan.id == plan_id, AiContentPlan.workspace_id == workspace.id)
        .first()
    )


def _coerce_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def add_item(db: Session, plan: AiContentPlan, data: Dict[str, Any]) -> AiContentPlanItem:
    item = AiContentPlanItem(
        plan_id=plan.id,
        publish_date=_coerce_date(data.get("publish_date")),
        channel=data.get("channel"),
        content_type=data.get("content_type"),
        title=data["title"],
        brief=data.get("brief"),
        status=data.get("status") or AiContentPlanItemStatus.IDEA.value,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item: AiContentPlanItem, updates: Dict[str, Any]) -> AiContentPlanItem:
    if "status" in updates and updates["status"] is not None and updates["status"] not in PLAN_ITEM_STATUSES:
        raise ValueError(f"Недопустимый статус. Доступны: {', '.join(PLAN_ITEM_STATUSES)}")
    for field in ("publish_date", "channel", "content_type", "title", "brief", "status", "generated_content_id"):
        if field in updates and updates[field] is not None:
            setattr(item, field, updates[field])
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: AiContentPlanItem) -> None:
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
        parsed.append(
            {
                "publish_date": row.get("date") or row.get("publish_date"),
                "channel": row.get("channel"),
                "content_type": row.get("goal") or row.get("content_type"),
                "title": str(row.get("topic") or row.get("title")).strip()[:256],
                "brief": row.get("brief") or row.get("тезис"),
            }
        )
    if not parsed:
        raise ValueError("Ни один пункт плана от AI не прошёл валидацию")
    return parsed


async def generate_items(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    plan: AiContentPlan,
    count: int,
    channels: List[str],
    goals: Optional[str] = None,
    important_events: Optional[str] = None,
) -> List[AiContentPlanItem]:
    if not ai_gateway.is_configured("text"):
        raise ValueError("AI Tunnel не настроен — контент-план нельзя сгенерировать автоматически")

    knowledge_hits = knowledge_svc.search(db, workspace, f"{goals or ''} {important_events or ''}".strip())
    system_prompt = prompt_builder.build_system_prompt(workspace, None, knowledge_hits)
    system_prompt += (
        "\n\nВерни ТОЛЬКО JSON без markdown: "
        '{"items":[{"date":"YYYY-MM-DD","channel":"vk|telegram|site|email|short|universal",'
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
        feature=f"ai_studio:{workspace.code}:content_plan",
        system=system_prompt,
        prompt=user_prompt,
        json_mode=True,
        temperature=0.5,
        max_tokens=1800,
        user_id=getattr(user, "id", None),
    )
    if not result.ok or not result.text:
        raise ValueError(result.error or "AI не вернул ответ")

    parsed_items = _parse_plan_items(result.json_object())

    created: List[AiContentPlanItem] = []
    for row in parsed_items[:count]:
        created.append(add_item(db, plan, row))
    return created
