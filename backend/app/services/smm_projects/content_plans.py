"""AI-assisted editorial plans for SMM projects."""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.models import SmmContent, SmmContentPlan, SmmContentPlanItem, SmmProject, SmmPublication
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import assets as assets_svc
from app.services.smm_projects.prompt_builder import GLOBAL_SAFETY_RULES, _brand_block

DEFAULT_FORMATS = ["Пост", "Карточка", "Карусель", "Видео / Reels / Shorts", "Инфографика"]
DEFAULT_GENRES = ["Экспертный", "Образовательный", "Интерактивный", "Юмористический", "История / закулисье", "Анонс / продающий"]


def plan_readiness(db: Session, project: SmmProject) -> Dict[str, Any]:
    knowledge_items = knowledge_svc.list_items(db, project)
    publications = (
        db.query(SmmPublication, SmmContent, SmmContentPlanItem)
        .outerjoin(SmmContent, SmmContent.id == SmmPublication.content_id)
        .outerjoin(SmmContentPlanItem, SmmContentPlanItem.id == SmmContent.plan_item_id)
        .filter(SmmPublication.project_id == project.id)
        .all()
    )
    by_channel: Dict[str, int] = {}
    by_format: Dict[str, int] = {}
    successful = failed = scheduled = 0
    last_published_at = None
    for publication, content, plan_item in publications:
        by_channel[publication.channel] = by_channel.get(publication.channel, 0) + 1
        if publication.status == "success":
            successful += 1
            if publication.published_at and (last_published_at is None or publication.published_at > last_published_at):
                last_published_at = publication.published_at
        elif publication.status == "error":
            failed += 1
        elif publication.status == "scheduled":
            scheduled += 1
        fmt = None
        if plan_item:
            fmt = plan_item.content_format
        fmt = fmt or ((content.input_json or {}).get("content_format") if content else None) or "Не указан"
        by_format[fmt] = by_format.get(fmt, 0) + 1
    return {
        "ai": ai_gateway.configuration_status("text"),
        "context": {
            "active_items": len(knowledge_items),
            "indexed_items": sum(1 for item in knowledge_items if item.content),
            "total_chars": sum(len(item.content or "") for item in knowledge_items),
            "items": [
                {"id": item.id, "title": item.title, "source_type": item.source_type, "filename": item.original_filename}
                for item in knowledge_items
            ],
        },
        "publication_stats": {
            "total": len(publications),
            "successful": successful,
            "failed": failed,
            "scheduled": scheduled,
            "by_channel": by_channel,
            "by_format": by_format,
            "last_published_at": last_published_at.isoformat() if last_published_at else None,
            "engagement_metrics_available": False,
        },
    }


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _plain_post_text(value: str) -> str:
    """Convert model markdown-ish output to readable social-post text."""
    text = re.sub(r"```(?:\w+)?\s*|```", "", value or "")
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"(\*\*|__|~~|`)", "", text)
    text = re.sub(r"^\s*[-*+]\s+", "• ", text, flags=re.MULTILINE)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


async def _materialize_media(db: Session, project: SmmProject, content: SmmContent, item: SmmContentPlanItem) -> str | None:
    format_name = (item.content_format or "").lower()
    if "карт" not in format_name and "карусел" not in format_name:
        return None
    count = 5 if "карусел" in format_name else 1
    try:
        for slide in range(1, count + 1):
            slide_hint = (
                f"Создай изображение для публикации проекта. Это слайд {slide} из {count}. "
                "Не добавляй текст, логотипы, даты или цены на изображение. "
                f"Тема публикации: {content.title}. Факты и смысл: {content.output_text}"
            )
            await assets_svc.render_image(
                db,
                None,
                project=project,
                content=content,
                prompt=slide_hint,
                meta={"slide": slide, "slides_total": count, "content_format": item.content_format},
            )
        assets = assets_svc.list_assets(db, content)
        if assets and not content.selected_asset_id:
            assets_svc.select_asset(db, content, assets[-1].id)
        return None
    except Exception as exc:  # media failure must not lose the text draft
        return str(exc)


def list_plans(db: Session, project: SmmProject) -> List[SmmContentPlan]:
    return (
        db.query(SmmContentPlan)
        .options(joinedload(SmmContentPlan.items))
        .filter(SmmContentPlan.project_id == project.id)
        .order_by(SmmContentPlan.date_from.desc(), SmmContentPlan.id.desc())
        .all()
    )


async def _generate_item_draft(db: Session, *, plan: SmmContentPlan, item: SmmContentPlanItem) -> bool:
    """Create one editable draft from a content-plan row."""
    if item.generated_content_id is not None or item.status != "planned":
        return False
    project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
    if project is None:
        return False
    knowledge = knowledge_svc.as_prompt_block(knowledge_svc.list_items(db, project), max_chars=12000)
    system = "\n\n".join(part for part in [GLOBAL_SAFETY_RULES, _brand_block(project), knowledge, (
        "Ты — редактор SMM-проекта. Создай готовый черновик публикации по брифу. "
        "Не выдумывай факты, даты, цены и характеристики, которых нет в контексте. "
        "Верни только текст публикации без пояснений."
    )] if part)
    prompt = (
        f"Дата публикации: {item.publish_date.isoformat()}\n"
        f"Тема: {item.title}\n"
        f"Рубрика: {item.rubric or 'без рубрики'}\n"
        f"Формат: {item.content_format}\n"
        f"Канал: {item.channel or 'универсальный'}\n"
        f"Бриф: {item.brief or 'раскрой тему через подтверждённые факты проекта'}\n"
        f"Механика удержания: {item.retention_mechanic or 'вопрос аудитории в конце'}"
    )
    raw = ""
    provider = model = None
    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature=f"smm_projects:{project.code}:scheduled_plan_item",
            system=system,
            prompt=prompt,
            temperature=0.55,
            max_tokens=1400,
            user_id=plan.created_by_id,
        )
        if result.ok and result.text:
            raw = result.text.strip()
            provider, model = result.provider, result.model
    output = _plain_post_text(raw or f"{item.title}\n\n{item.brief or 'Подготовить публикацию по материалам проекта.'}")
    content = SmmContent(
        project_id=project.id,
        plan_item_id=item.id,
        created_by_id=plan.created_by_id,
        title=item.title,
        input_json={"source": "content_plan", "plan_item_id": item.id, "publish_date": item.publish_date.isoformat(), "content_format": item.content_format},
        prompt_text=prompt,
        output_text=output,
        provider=provider,
        model=model,
        status="draft",
        channel=item.channel,
        auto_generated=True,
    )
    db.add(content)
    db.flush()
    media_error = await _materialize_media(db, project, content, item)
    content.input_json = {
        **(content.input_json or {}),
        "media_status": "error" if media_error else ("ready" if item.content_format in ("Пост", "Пост + карточка") else "generated"),
        **({"media_error": media_error} if media_error else {}),
    }
    item.generated_content_id = content.id
    item.status = "generated"
    db.commit()
    return True


async def generate_plan_items(db: Session, *, plan: SmmContentPlan) -> int:
    """Immediately materialize all rows of a newly created plan as drafts."""
    created = 0
    for item in sorted(plan.items, key=lambda row: (row.publish_date, row.position)):
        if await _generate_item_draft(db, plan=plan, item=item):
            created += 1
    return created


async def generate_due_items(db: Session, *, limit: int = 5) -> int:
    """Fallback worker for plan rows that were not materialized immediately."""
    today = date.today()
    rows = (
        db.query(SmmContentPlanItem)
        .join(SmmContentPlan, SmmContentPlan.id == SmmContentPlanItem.plan_id)
        .filter(
            SmmContentPlan.status == "draft",
            SmmContentPlanItem.publish_date <= today,
            SmmContentPlanItem.generated_content_id.is_(None),
            SmmContentPlanItem.status == "planned",
        )
        .order_by(SmmContentPlanItem.publish_date, SmmContentPlanItem.id)
        .limit(limit)
        .all()
    )
    created = 0
    for item in rows:
        plan = db.query(SmmContentPlan).filter(SmmContentPlan.id == item.plan_id).first()
        if plan and await _generate_item_draft(db, plan=plan, item=item):
            created += 1
    return created


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
    topics = payload.get("_knowledge_titles") or []
    rows: List[Dict[str, Any]] = []
    current = start
    step = max(1, round(7 / max(1, int(payload.get("posts_per_week") or 3))))
    i = 0
    while current <= end:
        rows.append({
            "date": current.isoformat(),
            "rubric": topics[i % len(topics)] if topics else "Тема проекта",
            "title": topics[i % len(topics)] if topics else f"Контент по теме проекта №{i + 1}",
            "brief": "Раскрыть тему через материалы постоянного контекста проекта; неподтверждённые детали пометить для уточнения.",
            "retention_mechanic": "Вопрос аудитории и просьба поделиться мнением",
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
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start : end + 1])
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

    # Контекст плана должен быть постоянным и полным: при генерации месячного
    # плана читаем все активные факты/файлы проекта, а не только совпадения по
    # короткому запросу формы.
    hits = knowledge_svc.list_items(db, project)
    knowledge = knowledge_svc.as_prompt_block(hits, max_chars=18000)
    readiness = plan_readiness(db, project)
    stats = readiness["publication_stats"]
    fallback_payload = {**payload, "_knowledge_titles": [item.title for item in hits if item.title]}
    fallback = _fallback_items(fallback_payload)
    requested_formats = payload.get("formats") or DEFAULT_FORMATS
    requested_genres = payload.get("genres") or DEFAULT_GENRES
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
        f"Жанры и тон публикаций: {', '.join(requested_genres)}. Распредели их по плану разнообразно, не делай все публикации экспертными.\n"
        f"Публикаций в неделю: {payload.get('posts_per_week')}.\n"
        f"Дополнительный контекст: {payload.get('extra_context') or 'нет'}.\n"
        f"Статистика прошлых публикаций: всего {stats['total']}, успешно {stats['successful']}, ошибок {stats['failed']}; "
        f"по каналам: {json.dumps(stats['by_channel'], ensure_ascii=False)}; "
        f"по форматам: {json.dumps(stats['by_format'], ensure_ascii=False)}.\n"
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
            timeout=120.0,
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
        genres=requested_genres,
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
    db.refresh(plan)
    await generate_plan_items(db, plan=plan)
    return get_plan(db, project, plan.id)  # type: ignore[return-value]
