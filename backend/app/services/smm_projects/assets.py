"""Генерация визуалов — отдельная сущность от текстового контента."""
from __future__ import annotations

import base64
import io
import mimetypes
import logging
import os
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session
from PIL import Image

from app.models import SmmContent, SmmContentAsset, SmmProject, SmmPublication, SmmPublicationStatus
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import storage

logger = logging.getLogger(__name__)

_IMAGE_TEXT_GUARD = (
    "КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ НАДПИСЕЙ: используй только русский язык и кириллицу. "
    "Запрещены английские слова, латинские буквы и псевдотекст. Если не получается "
    "написать надпись правильно по-русски, не добавляй на изображение никаких слов, "
    "букв или логотипов."
)

_VISUAL_REFERENCE_GUARD = (
    "Используй приложенные референсы только как визуальные ориентиры выбранного проекта: "
    "соблюдай его палитру, художественный стиль и качество. Не копируй референс целиком, "
    "его композицию, людей, персонажей или логотипы. Не добавляй элементы других брендов. "
    "Следуй описанию материала и бренд-профилю именно этого проекта."
)


def _with_image_text_guard(prompt: str) -> str:
    return prompt if _IMAGE_TEXT_GUARD in prompt else f"{prompt}\n\n{_IMAGE_TEXT_GUARD}"


async def build_image_prompt(*, db: Session, project: SmmProject, content: SmmContent, user) -> str:
    structured = content.output_json if isinstance(content.output_json, dict) else {}
    brand = project.brand_context if isinstance(project.brand_context, dict) else {}
    brand_lines = ", ".join(f"{key}: {value}" for key, value in brand.items() if value)
    base_prompt = str(structured.get("image_prompt") or "").strip()
    if not base_prompt:
        base_prompt = (
            "Создай визуальный промпт для social media изображения. Не рисуй текст, даты, цены или логотипы. "
            "Опирайся только на факты материала. Укажи композицию, настроение и тип визуала.\n"
            f"Бренд: {brand_lines or 'не задан'}\n"
            f"Тип материала: {content.title or 'social post'}\n"
            f"Факты: {content.output_text or content.title or ''}"
        )

    # Контекст проекта должен влиять и на визуалы. При загрузке изображений их
    # содержание сохраняется в SmmKnowledgeItem как image_reference, поэтому
    # передаём генератору не бинарник, а подготовленное описание референса.
    knowledge_items = knowledge_svc.list_items(db, project)
    # Visual identity is intentionally project-local even when a personal
    # social account is allowed to use facts from the other projects.
    visual_refs = [
        item for item in knowledge_items
        if item.source_type == "image_reference" or (item.content_type or "").startswith("image/")
    ]
    visual_block = "\n\n=== РЕФЕРЕНСЫ ВИЗУАЛЬНОГО СТИЛЯ ЭТОГО ПРОЕКТА ===\n" + "\n".join(
        f"[{item.title}] {(item.content or '')[:1400]}" for item in visual_refs[:12]
    ) if visual_refs else ""
    content_sources = knowledge_svc.content_items(db, project)
    context_block = knowledge_svc.as_prompt_block(content_sources[:12], max_chars=7000) if content_sources else ""
    brand = project.brand_context if isinstance(project.brand_context, dict) else {}
    visual_profile = "\n".join(
        f"{label}: {brand[key]}" for key, label in (
            ("visual_palette", "Палитра"), ("visual_style", "Стиль"),
            ("logo_usage", "Правила логотипа"), ("allowed_imagery", "Разрешённые образы"),
            ("forbidden_imagery", "Запрещённые образы"), ("people_style", "Стиль изображения людей"),
            ("image_composition", "Композиция"),
        ) if brand.get(key)
    )
    prompt = (
        f"{base_prompt}\n\n"
        "Формат: вертикальная публикация 4:5. Создай один цельный визуал для ленты, "
        "без встроенных заголовков и псевдотекста; текст публикации размещается отдельно в подписи.\n"
        f"Проект: {project.name}. Следуй его собственному бренд-профилю и не заимствуй "
        "визуальную идентичность других проектов.\n"
        f"{visual_profile}\n"
        "Используй только образы, уместные теме и разрешённые брендом. "
        "Если в изображении есть подписи, заголовки или другие слова, пиши их только на русском языке, "
        "кириллицей, без английских букв. Не вставляй английский текст. "
        f"{visual_block}{context_block}"
    )
    if not ai_gateway.is_configured("text"):
        return prompt
    result = await ai_gateway.complete_text(
        feature=f"smm_projects:{project.code}:image_prompt",
        system="Верни только короткий промпт для генератора изображений без пояснений. Не используй латиницу в надписях.",
        prompt=prompt, user_id=getattr(user, "id", None), temperature=0.4, max_tokens=500,
    )
    return _with_image_text_guard((result.text or prompt).strip()) if result.ok else _with_image_text_guard(prompt)


def _visual_input_references(
    db: Session, project: SmmProject, *, content_id: Optional[int] = None,
) -> list[dict[str, object]]:
    """Подготовить разнообразный набор изображений проекта для image-to-image.

    Провайдер принимает ограниченное число референсов. Не следует каждый раз
    отправлять одну и ту же первую картинку (например, чумного доктора):
    циклическое окно меняет набор персонажей между публикациями, сохраняя
    детерминированность и повторяемость для одной публикации.
    """
    references: list[dict[str, object]] = []
    total_bytes = 0
    candidates = []
    for item in knowledge_svc.list_items(db, project):
        content_type = (item.content_type or "").lower()
        filename = (item.original_filename or "").lower()
        suffix = os.path.splitext(filename)[1]
        is_image = (
            item.source_type == "image_reference"
            or content_type.startswith("image/")
            or suffix in {".jpg", ".jpeg", ".png", ".webp"}
        )
        if not is_image:
            continue
        if not item.storage_key:
            continue
        candidates.append(item)

    # Use one visual from a successful publication in this project alongside
    # the project's curated references. This lets the archive inform the look
    # of new creatives without repeatedly sampling one and the same archive
    # asset or allowing old posts to replace the curated brand references.
    archived_candidates = []
    try:
        archive_query = db.query(SmmContentAsset) if db is not None else None
        if archive_query is not None and hasattr(archive_query, "join"):
            archived_candidates = (
                archive_query
                .join(SmmPublication, SmmPublication.content_id == SmmContentAsset.content_id)
                .filter(
                    SmmPublication.project_id == project.id,
                    SmmPublication.status == SmmPublicationStatus.SUCCESS.value,
                    SmmContentAsset.storage_key.isnot(None),
                )
                .order_by(SmmPublication.published_at.desc(), SmmPublication.id.desc(), SmmContentAsset.id)
                .limit(20)
                .all()
            )
    except Exception:  # noqa: BLE001 — отсутствие архива не должно блокировать генерацию
        logger.exception("smm visual archive lookup failed for project %s", project.code)
        if db is not None:
            db.rollback()
    archived_candidates = list({asset.id: asset for asset in archived_candidates if asset.id is not None}.values())
    if archived_candidates:
        start = (max(int(content_id or 1), 1) - 1) % len(archived_candidates)
        archived_candidates = [archived_candidates[start]]

    if candidates:
        start = (max(int(content_id or 1), 1) - 1) % len(candidates)
        curated_limit = 3 if archived_candidates else 4
        candidates = [candidates[(start + index) % len(candidates)] for index in range(min(curated_limit, len(candidates)))]
    candidates = archived_candidates + candidates

    for item in candidates:
        content_type = (item.content_type or mimetypes.guess_type(item.original_filename or "")[0] or "").lower()
        if content_type == "image/jpg":
            content_type = "image/jpeg"
        if not content_type.startswith("image/"):
            content_type = mimetypes.guess_type(item.original_filename or "")[0] or "image/png"
        if content_type not in {"image/png", "image/jpeg", "image/webp"}:
            continue
        try:
            raw = storage.read_bytes(item.storage_key)
        except Exception:  # noqa: BLE001 — один некорректный референс не ломает весь рендер
            logger.warning(
                "smm visual reference could not be read; skipping project=%s reference_id=%s",
                project.code,
                getattr(item, "id", None),
                exc_info=True,
            )
            continue
        if not raw or len(raw) > 12 * 1024 * 1024 or total_bytes + len(raw) > 40 * 1024 * 1024:
            continue
        try:
            # Gemini может отклонять валидные по расширению файлы с нестандартным
            # codec/profile (CMYK JPEG, animated WebP и т.п.). Нормализуем только
            # копию для API в обычный RGB PNG; оригинал пользователя не меняем.
            with Image.open(io.BytesIO(raw)) as image:
                normalized = io.BytesIO()
                image.convert("RGB").save(normalized, format="PNG", optimize=True)
                raw = normalized.getvalue()
        except Exception:
            continue
        data_uri = f"data:image/png;base64,{base64.b64encode(raw).decode('ascii')}"
        references.append({"type": "image_url", "image_url": {"url": data_uri}})
        total_bytes += len(raw)
    return references


async def render_image(
    db: Session, user, *, project: SmmProject, content: SmmContent, prompt: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> SmmContentAsset:
    final_prompt = _with_image_text_guard((prompt or await build_image_prompt(db=db, project=project, content=content, user=user)).strip())
    if not final_prompt:
        raise ValueError("Нет промпта для генерации изображения")
    if not ai_gateway.is_configured("image"):
        raise ValueError("Генератор изображений не настроен (нет image-провайдера в AI Tunnel)")

    # AITunnel принимает до нескольких input_references для image-to-image.
    # Передаём именно загруженные изображения персонажей/стиля, а не только их OCR/AI-описания.
    references = _visual_input_references(db, project, content_id=getattr(content, "id", None))
    if references and _VISUAL_REFERENCE_GUARD not in final_prompt:
        final_prompt = f"{final_prompt}\n\n{_VISUAL_REFERENCE_GUARD}"
    result = await ai_gateway.generate_image(
        feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
        aspect_ratio="4:5", input_references=references or None, user_id=getattr(user, "id", None),
    )
    if not result.ok and references:
        # Gemini иногда отвечает finish_reason=STOP без картинки и без явного
        # block_reason — не блокировка по политике, а отказ именно совмещать
        # запрос с переданными референсами (часто это реальные фото людей на
        # Не теряем связь с брендом при повторе: уменьшаем набор до одного
        # референса, но не запускаем нерелевантную генерацию без визуального якоря.
        logger.warning("smm render_image retrying with one reference after provider error: %s", result.error)
        result = await ai_gateway.generate_image(
            feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
            aspect_ratio="4:5", input_references=references[:1], user_id=getattr(user, "id", None),
        )
    if not result.ok or not result.data:
        raise ValueError(result.error or "Генератор изображений вернул пустой ответ")

    item: Dict[str, Any] = result.data[0] if isinstance(result.data, list) and result.data else {}
    b64 = item.get("b64_json") if isinstance(item, dict) else None
    url = item.get("url") if isinstance(item, dict) else None

    if not b64 and not url:
        raise ValueError("Генератор изображений вернул ответ без url и без данных файла")

    storage_key = None
    if b64:
        storage_key = storage.save_bytes(base64.b64decode(b64), f"content_{content.id}.png")
    elif url:
        # Некоторые провайдеры (напр. Gemini через AI Tunnel) возвращают только
        # временный url, без b64_json. Без локальной копии байтов каналы,
        # которым нужен файл, а не ссылка (Telegram/VK/MAX), молча публикуют
        # пост без картинки — attachments остаются пустыми, publish() не
        # падает с ошибкой. Поэтому сразу скачиваем картинку по url и
        # сохраняем как storage_key; сам url всё равно оставляем для Instagram.
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url)
                response.raise_for_status()
            storage_key = storage.save_bytes(response.content, f"content_{content.id}.png")
        except Exception as exc:  # noqa: BLE001 — остаёмся на url-only, а не роняем генерацию
            logger.warning("smm asset download failed, keeping url-only: %s", exc)

    asset = SmmContentAsset(
        content_id=content.id, asset_type="image", prompt=final_prompt, provider=result.provider,
        model=result.model, url=url, storage_key=storage_key, meta=meta,
        created_by_id=getattr(user, "id", None),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    # Публикация (publishing.create_publications) берёт картинку только из
    # content.selected_asset_id — в UI нет отдельного шага "выбрать визуал",
    # "Создать визуал" это единственное действие пользователя, поэтому без
    # автовыбора только что сгенерированный визуал молча пропадал при
    # публикации (пост уходил без картинки, без ошибки).
    select_asset(db, content, asset.id)
    return asset


def list_assets(db: Session, content: SmmContent):
    return db.query(SmmContentAsset).filter(SmmContentAsset.content_id == content.id).order_by(SmmContentAsset.created_at.desc()).all()


def select_asset(db: Session, content: SmmContent, asset_id: int) -> SmmContentAsset:
    asset = db.query(SmmContentAsset).filter(SmmContentAsset.id == asset_id, SmmContentAsset.content_id == content.id).first()
    if asset is None:
        raise ValueError("Visual не принадлежит материалу")
    db.query(SmmContentAsset).filter(SmmContentAsset.content_id == content.id).update({"is_selected": False}, synchronize_session=False)
    asset.is_selected = True
    content.selected_asset_id = asset.id
    db.commit()
    db.refresh(asset)
    return asset
