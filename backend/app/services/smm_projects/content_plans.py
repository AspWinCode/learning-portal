"""AI-assisted editorial plans for SMM projects."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

from sqlalchemy.orm import Session, joinedload

from app.models import SmmContent, SmmContentPlan, SmmContentPlanItem, SmmProject, SmmPublication, SmmPublicationStatus
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import assets as assets_svc
from app.services.smm_projects.prompt_builder import GLOBAL_SAFETY_RULES, _brand_block

DEFAULT_FORMATS = ["Пост", "Карусель", "Видео / Reels / Shorts", "Инфографика"]
GENRE_ORGANIZER_THOUGHTS = "Размышления организаторов"
GENRE_PROGRAMMING_NEWS = "Новости программирования и геймдева"
DEFAULT_GENRES = [
    "Экспертный", "Образовательный", "Интерактивный", "Юмористический", "История / закулисье",
    "Анонс / продающий", GENRE_ORGANIZER_THOUGHTS, GENRE_PROGRAMMING_NEWS,
]

# Для этих жанров generate_plan() просит у планировщика более узкую, не
# рекламную подачу — без них LLM мог вернуть жанр просто как ярлык (rubric),
# а сам текст черновика получался обычным анонсом/постом. Текст инструкций
# намеренно совпадает с prompt_template шаблонов "organizer_thoughts" /
# "programming_news" (templates.py), чтобы контент-план и ручная генерация
# давали одинаковый стиль для одной и той же темы.
GENRE_DRAFT_INSTRUCTIONS = {
    GENRE_ORGANIZER_THOUGHTS: (
        "Это личное размышление от лица организаторов КодАрены на тему, близкую "
        "программированию и разработке — НЕ анонс события. Не упоминай конкретные "
        "турниры, даты, цены или цифры, которых нет в брифе: это мнение/рассуждение, "
        "а не объявление."
    ),
    GENRE_PROGRAMMING_NEWS: (
        "Это новостной пост на стыке программирования и разработки игр. Опирайся "
        "строго на факты из брифа — не придумывай детали новости сверх того, что там "
        "указано, и не выдавай рассуждение за подтверждённую новость."
    ),
}


def _pick_news_item(plan: SmmContentPlan, item: SmmContentPlanItem) -> str | None:
    """Вернуть вручную вставленную новость для этого item жанра
    "Новости программирования и геймдева" — своя на каждый такой item по
    порядку, с переходом по кругу, если новостей вставили меньше, чем items.
    Автопоиска по интернету нет: нет оплаченного search API, и выдумывать
    "новость" без реального источника LLM запрещено общими правилами."""
    news_items = [str(n).strip() for n in (plan.news_items or []) if str(n).strip()]
    if not news_items or item.genre != GENRE_PROGRAMMING_NEWS:
        return None
    siblings = sorted(
        (i for i in plan.items if i.genre == GENRE_PROGRAMMING_NEWS),
        key=lambda i: (i.position, i.id or 0),
    )
    try:
        index = siblings.index(item)
    except ValueError:
        index = 0
    return news_items[index % len(news_items)]


def _performance_breakdown(publications) -> Dict[str, List[Dict[str, Any]]]:
    """Aggregate engagement by channel+format and channel+genre.

    Rates are weighted by views; segments with fewer than three measured posts
    stay visible for context but are marked ineligible for AI recommendations.
    """
    grouped: Dict[str, Dict[tuple, Dict[str, int]]] = {"by_channel_format": {}, "by_channel_genre": {}}
    for publication, content, plan_item in publications:
        if publication.status != SmmPublicationStatus.SUCCESS.value:
            continue
        metrics = publication.metrics_json if isinstance(publication.metrics_json, dict) else {}
        views = metrics.get("views")
        if not isinstance(views, (int, float)) or views <= 0:
            continue
        interactions = sum(
            int(metrics.get(key) or 0) for key in ("likes", "comments", "reposts")
            if isinstance(metrics.get(key), (int, float))
        )
        content_format = (
            (plan_item.content_format if plan_item else None)
            or ((content.input_json or {}).get("content_format") if content else None)
            or "Не указан"
        )
        genre = (plan_item.genre if plan_item else None) or "Не указан"
        dimensions = (
            ("by_channel_format", (publication.channel, content_format)),
            ("by_channel_genre", (publication.channel, genre)),
        )
        for dimension, key in dimensions:
            group = grouped[dimension].setdefault(key, {"posts": 0, "views": 0, "interactions": 0})
            group["posts"] += 1
            group["views"] += int(views)
            group["interactions"] += interactions

    result: Dict[str, List[Dict[str, Any]]] = {}
    for dimension, values in grouped.items():
        rows = []
        for key, totals in values.items():
            labels = {"channel": key[0]}
            labels["format" if dimension == "by_channel_format" else "genre"] = key[1]
            rows.append({
                **labels,
                "sample_size": totals["posts"],
                "views": totals["views"],
                "interactions": totals["interactions"],
                "engagement_rate": round(totals["interactions"] / totals["views"] * 100, 2),
                "enough_data": totals["posts"] >= 3,
            })
        result[dimension] = sorted(
            rows, key=lambda row: (row["enough_data"], row["sample_size"], row["engagement_rate"]), reverse=True,
        )[:20]
    return result


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
    metrics_publications = 0
    metrics_totals = {"views": 0, "likes": 0, "comments": 0, "reposts": 0}
    performance_insights = _performance_breakdown(publications)
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
        metrics = publication.metrics_json if isinstance(publication.metrics_json, dict) else {}
        if metrics:
            metrics_publications += 1
            for key in metrics_totals:
                value = metrics.get(key)
                if isinstance(value, (int, float)):
                    metrics_totals[key] += int(value)
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
            "engagement_metrics_available": metrics_publications > 0,
            "metrics_publications": metrics_publications,
            "metrics_totals": metrics_totals,
            "performance_insights": performance_insights,
        },
    }


def recent_publication_archive(
    db: Session, project: SmmProject, *, limit: int = 100, lookback_days: int = 365,
) -> List[Dict[str, Any]]:
    """Return successful posts for recent-duplicate checks and editorial examples."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = (
        db.query(SmmPublication)
        .join(SmmContent, SmmContent.id == SmmPublication.content_id)
        .filter(
            SmmPublication.project_id == project.id,
            SmmPublication.status == SmmPublicationStatus.SUCCESS.value,
            SmmPublication.published_at >= cutoff,
        )
        .order_by(SmmPublication.published_at.desc(), SmmPublication.id.desc())
        .limit(limit)
        .all()
    )
    archive = []
    for publication in rows:
        content = publication.content
        body = _plain_post_text(publication.text_snapshot or content.output_text or "")
        if not body:
            continue
        archive.append({
            "title": content.title or "Без названия",
            "channel": publication.channel,
            "published_at": publication.published_at.date().isoformat() if publication.published_at else None,
            "text": body[:900],
        })
    return archive


def _topic_tokens(value: str) -> set[str]:
    stop = {"как", "что", "это", "для", "или", "при", "над", "под", "про", "его", "ее", "their", "with"}
    return {word.lower() for word in re.findall(r"[\wа-яёА-ЯЁ]{3,}", value or "") if word.lower() not in stop}


def _recent_topic_warnings(archive: List[Dict[str, Any]], *, within_days: int = 90) -> List[str]:
    today = date.today()
    warnings = []
    seen: set[str] = set()
    for post in archive:
        date_text = post.get("published_at")
        if not date_text:
            continue
        try:
            published = date.fromisoformat(date_text)
        except ValueError:
            continue
        age = (today - published).days
        if age < 0 or age > within_days:
            continue
        title = str(post.get("title") or "")
        normalized = " ".join(sorted(_topic_tokens(title)))
        if normalized in seen:
            continue
        seen.add(normalized)
        warnings.append(f"{published.isoformat()} ({age} дн. назад), {post.get('channel')}: {title}")
    return warnings


def _archive_prompt_block(archive: List[Dict[str, Any]], *, max_chars: int = 7000) -> str:
    if not archive:
        return ""
    lines = ["=== АРХИВ УЖЕ ОПУБЛИКОВАННОГО КОНТЕНТА (примеры подачи, не источник фактов) ==="]
    used = len(lines[0])
    for entry in archive:
        line = f"[{entry.get('published_at') or 'дата неизвестна'}; {entry.get('channel')}] {entry['title']}: {entry['text']}"
        if used + len(line) + 1 > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    return "\n".join(lines) if len(lines) > 1 else ""


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _without_card_format(values: Any) -> List[str]:
    formats = [str(value).strip() for value in (values or []) if str(value).strip()]
    filtered = [value for value in formats if "карточк" not in value.lower()]
    return filtered or list(DEFAULT_FORMATS)


def _plain_post_text(value: str) -> str:
    """Convert model markdown-ish output to readable social-post text."""
    text = re.sub(r"```(?:\w+)?\s*|```", "", value or "")
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"(\*\*|__|~~|`)", "", text)
    text = re.sub(r"^\s*[-*+]\s+", "• ", text, flags=re.MULTILINE)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _carousel_thoughts(content: SmmContent) -> List[str]:
    """Разложить текст поста на пять коротких смыслов для слайдов."""
    raw = _plain_post_text(content.output_text or "")
    candidates: List[str] = []
    for line in raw.splitlines():
        line = re.sub(r"^\s*(?:[-*•✅✓]\s*|\d+[.)]\s*)", "", line).strip()
        if line and len(line) >= 12:
            candidates.append(line)
    if len(candidates) < 5:
        candidates = [part.strip() for part in re.split(r"(?<=[.!?])\s+", raw) if len(part.strip()) >= 12]

    result: List[str] = []
    for candidate in candidates:
        if candidate not in result:
            result.append(candidate[:240])
        if len(result) == 5:
            break
    fallbacks = [
        f"Главная тема: {content.title or 'тема публикации'}",
        "Одна стратегия — одна понятная цель",
        "Разбирай идею на простые шаги",
        "Проверь решение на практике",
        "Сделай следующий шаг",
    ]
    for fallback in fallbacks:
        if len(result) == 5:
            break
        result.append(fallback)
    return result[:5]


async def _materialize_media(db: Session, project: SmmProject, content: SmmContent, item: SmmContentPlanItem) -> str | None:
    format_name = (item.content_format or "").lower()
    # Инфографика — тоже визуальный формат: это одно готовое изображение,
    # а не текстовый черновик. Раньше здесь учитывались только старый формат
    # «Карточка» и карусель, поэтому для «Инфографика» визуал не создавался.
    if not any(marker in format_name for marker in ("карт", "карусел", "инфограф")):
        return None
    count = 5 if "карусел" in format_name else 1
    thoughts = _carousel_thoughts(content) if "карусел" in format_name else []
    try:
        for slide in range(1, count + 1):
            if "инфограф" in format_name:
                slide_hint = (
                    "Создай одну готовую инфографику для публикации проекта. "
                    "Размести на ней короткие понятные подписи и факты только на русском языке, "
                    "кириллицей, без английских слов и букв. Не добавляй выдуманные факты, даты, цены "
                    "или логотипы. Используй нового персонажа, отличающегося от героев других публикаций. "
                    f"Тема: {content.title}. Факты и смысл: {content.output_text}"
                )
            else:
                thought = thoughts[slide - 1]
                slide_hint = (
                    f"Создай информативный слайд карусели для публикации проекта, слайд {slide} из 5. "
                    "На картинке обязательно размести крупный короткий заголовок и 1–2 строки пояснения "
                    "ТОЛЬКО на русском языке, кириллицей. Не используй английские слова и буквы. "
                    "Одна картинка — одна мысль; это не должна быть просто декоративная иллюстрация. "
                    "Сделай текст хорошо читаемым и визуально связанным с героем. "
                    f"Мысль этого слайда: {thought}. "
                    f"Тема карусели: {content.title}. Общий контекст поста: {content.output_text}"
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


async def _generate_item_draft(
    db: Session, *, plan: SmmContentPlan, item: SmmContentPlanItem, materialize_media: bool = True,
) -> bool:
    """Create one editable draft from a content-plan row."""
    if item.generated_content_id is not None or item.status != "planned":
        return False
    project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
    if project is None:
        return False
    knowledge = knowledge_svc.as_prompt_block(knowledge_svc.list_items(db, project), max_chars=12000)
    archive = _archive_prompt_block(recent_publication_archive(db, project)) if hasattr(db, "query") and hasattr(db.query(SmmPublication), "join") else ""
    genre_hint = GENRE_DRAFT_INSTRUCTIONS.get(item.genre)
    news_item = _pick_news_item(plan, item)
    system = "\n\n".join(part for part in [GLOBAL_SAFETY_RULES, _brand_block(project), knowledge, archive, genre_hint, (
        "Ты — редактор SMM-проекта. Создай готовый черновик публикации по брифу. "
        "Не выдумывай факты, даты, цены и характеристики, которых нет в контексте. "
        "Верни только текст публикации без пояснений."
    )] if part)
    prompt = (
        f"Дата публикации: {item.publish_date.isoformat()}\n"
        f"Тема: {item.title}\n"
        f"Рубрика: {item.rubric or 'без рубрики'}\n"
        f"Жанр: {item.genre or 'не задан'}\n"
        f"Формат: {item.content_format}\n"
        f"Канал: {item.channel or 'универсальный'}\n"
        f"Бриф: {item.brief or 'раскрой тему через подтверждённые факты проекта'}\n"
        f"Механика удержания: {item.retention_mechanic or 'вопрос аудитории в конце'}"
        "\nНе повторяй точные формулировки и сюжеты из архива. Сохраняй узнаваемую подачу, "
        "но придумай самостоятельный материал; факты бери только из базы знаний и брифа."
        + (f"\n\nРеальная новость, вставленная редактором (бери факты ТОЛЬКО отсюда, не из общих знаний):\n{news_item}" if news_item else "")
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
        input_json={"source": "content_plan", "plan_item_id": item.id, "publish_date": item.publish_date.isoformat(), "position": item.position, "content_format": item.content_format, "genre": item.genre},
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
    # Сначала фиксируем сам черновик и связь с планом. Генерация картинки может
    # занимать минуты или завершиться ошибкой провайдера, но это не должно
    # блокировать остальные публикации плана.
    item.generated_content_id = content.id
    item.status = "generated"
    content.input_json = {
        **(content.input_json or {}),
        "media_status": "pending" if materialize_media else "pending",
    }
    db.commit()

    if not materialize_media:
        return True

    media_error = await _materialize_media(db, project, content, item)
    content.input_json = {
        **(content.input_json or {}),
        "media_status": "error" if media_error else ("ready" if item.content_format in ("Пост", "Пост + карточка") else "generated"),
        **({"media_error": media_error} if media_error else {}),
    }
    db.commit()
    return True


async def generate_plan_items(db: Session, *, plan: SmmContentPlan) -> int:
    """Immediately materialize all rows of a newly created plan as drafts."""
    created = 0
    # Phase 1: persist every text draft first. This keeps the whole editorial
    # queue visible even if image generation is slow or unavailable.
    for item in sorted(plan.items, key=lambda row: (row.publish_date, row.position)):
        if await _generate_item_draft(db, plan=plan, item=item, materialize_media=False):
            created += 1

    # Phase 2: enrich already persisted drafts with media. A failure is stored
    # on the individual draft and never prevents the remaining rows from being
    # created or shown.
    for item in sorted(plan.items, key=lambda row: (row.publish_date, row.position)):
        if not item.generated_content_id:
            continue
        content = db.query(SmmContent).filter(SmmContent.id == item.generated_content_id).first()
        project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
        if content is None or project is None:
            continue
        media_error = await _materialize_media(db, project, content, item)
        content.input_json = {
            **(content.input_json or {}),
            "media_status": "error" if media_error else ("ready" if item.content_format in ("Пост", "Пост + карточка") else "generated"),
            **({"media_error": media_error} if media_error else {}),
        }
        db.commit()
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


async def generate_pending_media(db: Session, *, limit: int = 2) -> int:
    """Автоматически догенерировать визуалы у уже созданных черновиков.

    Текстовый черновик не должен зависеть от скорости image-провайдера. Если
    HTTP-запрос генерации плана оборвался, этот фоновый проход всё равно
    завершит визуалы без ручного клика «Создать визуал».
    """
    rows = (
        db.query(SmmContent, SmmContentPlanItem, SmmProject)
        .join(SmmContentPlanItem, SmmContentPlanItem.generated_content_id == SmmContent.id)
        .join(SmmContentPlan, SmmContentPlan.id == SmmContentPlanItem.plan_id)
        .join(SmmProject, SmmProject.id == SmmContent.project_id)
        .filter(SmmContent.input_json["media_status"].as_string() == "pending")
        .order_by(SmmContentPlanItem.publish_date, SmmContentPlanItem.position, SmmContent.id)
        .limit(limit)
        .all()
    )
    processed = 0
    for content, item, project in rows:
        media_error = await _materialize_media(db, project, content, item)
        content.input_json = {
            **(content.input_json or {}),
            "media_status": "error" if media_error else ("ready" if item.content_format in ("Пост", "Пост + карточка") else "generated"),
            **({"media_error": media_error} if media_error else {}),
        }
        db.commit()
        processed += 1
    return processed


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
    formats = _without_card_format(payload.get("formats"))
    genres = [str(g).strip() for g in (payload.get("genres") or DEFAULT_GENRES) if str(g).strip()] or DEFAULT_GENRES
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
            "genre": genres[i % len(genres)],
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
    archive = recent_publication_archive(db, project)
    archive_block = _archive_prompt_block(archive)
    recent_topics = _recent_topic_warnings(archive)
    stats = readiness["publication_stats"]
    fallback_payload = {**payload, "_knowledge_titles": [item.title for item in hits if item.title]}
    fallback = _fallback_items(fallback_payload)
    requested_formats = _without_card_format(payload.get("formats"))
    requested_genres = payload.get("genres") or DEFAULT_GENRES
    requested_news_items = [str(n).strip() for n in (payload.get("news_items") or []) if str(n).strip()]
    news_block = (
        "Реальные новости программирования/геймдева, вставленные редактором (их ровно "
        f"{len(requested_news_items)}): " + " ||| ".join(requested_news_items)
        if requested_news_items else ""
    )
    system = "\n\n".join(part for part in [GLOBAL_SAFETY_RULES, _brand_block(project), knowledge, archive_block, (
        "Ты — SMM-планер. Составляй только редакционный план, не готовые тексты. "
        "Опирайся на контекст проекта и не выдумывай факты. Верни ТОЛЬКО JSON вида "
        '{"items":[{"date":"YYYY-MM-DD","rubric":"...","title":"...",'
        '"brief":"...","retention_mechanic":"...","format":"...","genre":"...","channel":"..."}]}. '
        "Поле genre у каждого item — одно значение ДОСЛОВНО из списка жанров ниже."
    )] if part)
    prompt = (
        f"Период: {start.isoformat()} — {end.isoformat()}.\n"
        f"Цель: {payload.get('objective') or 'вовлечение и рост доверия'}.\n"
        f"Аудитория: {payload.get('audience') or 'аудитория проекта'}.\n"
        f"Каналы: {', '.join(payload.get('channels') or ['универсальный'])}.\n"
        f"Предпочтительные форматы: {', '.join(requested_formats)}.\n"
        f"Жанры и тон публикаций: {', '.join(requested_genres)}. Распредели их по плану разнообразно, не делай все "
        "публикации экспертными, и укажи выбранный жанр для каждого item в поле genre.\n"
        + (
            f"{news_block}\nДля жанра «{GENRE_PROGRAMMING_NEWS}» используй ровно {len(requested_news_items)} "
            "item(ов) (по одному на новость) — rubric/title/brief должны отражать именно эту новость, без "
            "придуманных деталей сверх неё.\n"
            if requested_news_items else
            f"Если выбран жанр «{GENRE_PROGRAMMING_NEWS}», но реальных новостей не передано — не создавай для "
            "него items вообще, не придумывай новость.\n"
        )
        + f"Публикаций в неделю: {payload.get('posts_per_week')}.\n"
        f"Дополнительный контекст: {payload.get('extra_context') or 'нет'}.\n"
        f"Статистика прошлых публикаций: всего {stats['total']}, успешно {stats['successful']}, ошибок {stats['failed']}; "
        f"по каналам: {json.dumps(stats['by_channel'], ensure_ascii=False)}; "
        f"по форматам: {json.dumps(stats['by_format'], ensure_ascii=False)}.\n"
        f"Метрики VK собраны для {stats['metrics_publications']} публикаций: "
        f"{json.dumps(stats['metrics_totals'], ensure_ascii=False)}. Если метрик нет — не делай выводов об эффективности. "
        f"Эффективность по каналам/форматам: {json.dumps(stats['performance_insights']['by_channel_format'], ensure_ascii=False)}; "
        f"по каналам/жанрам: {json.dumps(stats['performance_insights']['by_channel_genre'], ensure_ascii=False)}. "
        "Учитывай выводы по сегменту только при enough_data=true (не менее трёх публикаций с просмотрами); "
        "метрики не являются причинным доказательством — используй их как один из сигналов, сохраняя разнообразие плана. "
        f"В архиве {len(archive)} последних опубликованных материалов; смотри их тексты выше. "
        f"Темы, опубликованные за последние 90 дней (с датой и каналом): {json.dumps(recent_topics, ensure_ascii=False)}. "
        "Не предлагай совпадающую тему первые 90 дней. Для более старых повторов добавляй новый практический угол, "
        "а для свежих тем повтор допустим только при явно новом поводе и существенном отличии. "
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
    # The model can still echo an obsolete format from an older prompt.
    # Normalize it so new plans never create "Карточка" items.
    for item in items_data:
        if "карточк" in str(item.get("format") or "").lower():
            item["format"] = "Инфографика"
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
        news_items=requested_news_items,
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
            genre=str(item.get("genre") or "").strip()[:128] or None,
            channel=str(item.get("channel") or "").strip()[:32] or None,
        ))
    db.commit()
    db.refresh(plan)
    await generate_plan_items(db, plan=plan)
    return get_plan(db, project, plan.id)  # type: ignore[return-value]
