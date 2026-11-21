"""Генерация визуалов — отдельная сущность от текстового контента."""
from __future__ import annotations

import base64
import io
import mimetypes
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session
from PIL import Image, ImageOps

from app.models import SmmContent, SmmContentAsset, SmmKnowledgeItem, SmmProject, SmmPublication, SmmPublicationStatus
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
    "Не изображай персонажа или маскота, если задание явно этого не просит. "
    "Следуй описанию материала и бренд-профилю именно этого проекта."
)

_VISUAL_ROLE_LABELS = {
    "style": "Ориентир по стилю",
    "character": "Персонаж или маскот",
    "composition": "Ориентир по композиции",
    "example": "Пример публикации",
}

# Рекомендуемые шаблоны продукта: квадрат для карточных лент и компактных
# превью, вертикальный feed-портрет для Instagram. Это не заявление о строгих
# ограничениях VK/Telegram/MAX — их API допускают другие пропорции.
CHANNEL_VISUAL_PROFILES = {
    "instagram": {
        "aspect_ratio": "4:5", "ratio": 0.8, "label": "Instagram · портрет 4:5",
        "dimensions": "1080×1350", "safe_zone": "держи текст и логотипы внутри центральных 88% холста",
    },
    "vk": {
        "aspect_ratio": "1:1", "ratio": 1.0, "label": "VK · квадрат 1:1",
        "dimensions": "1080×1080", "safe_zone": "оставь 7% свободного края вокруг текста и логотипа",
    },
    "telegram": {
        "aspect_ratio": "1:1", "ratio": 1.0, "label": "Telegram · квадрат 1:1",
        "dimensions": "1080×1080", "safe_zone": "оставь 7% свободного края вокруг текста и логотипа",
    },
    "max": {
        "aspect_ratio": "1:1", "ratio": 1.0, "label": "MAX · квадрат 1:1",
        "dimensions": "1080×1080", "safe_zone": "оставь 7% свободного края вокруг текста и логотипа",
    },
}


def channel_visual_profile(channel: Optional[str]) -> Dict[str, Any]:
    return dict(CHANNEL_VISUAL_PROFILES.get(channel or "", {
        "aspect_ratio": "4:5", "ratio": 0.8, "label": "Универсальный · 4:5",
        "dimensions": "1080×1350", "safe_zone": "оставь 7% свободного края вокруг текста и логотипа",
    }))


def infer_visual_role(description: str) -> str:
    """Classify an uploaded image description; the project owner can change it."""
    text = (description or "").casefold()
    if re.search(r"персонаж|маскот|героин|\bгерой\b|character|mascot|avatar", text):
        return "character"
    if re.search(r"композиц|ракурс|макет|расположени[ея]|layout", text):
        return "composition"
    if re.search(r"пример публикац|пример поста|готов(?:ая|ый) публикац|готов(?:ая|ый) пост", text):
        return "example"
    return "style"


def _requests_character_reference(content: SmmContent) -> bool:
    structured = content.output_json if isinstance(content.output_json, dict) else {}
    prompt = " ".join((
        content.title or "",
        str(structured.get("image_prompt") or ""),
    )).casefold()
    return bool(re.search(r"персонаж|маскот|героин|\bгерой\b|character|mascot|avatar", prompt))


def _with_image_text_guard(prompt: str) -> str:
    return prompt if _IMAGE_TEXT_GUARD in prompt else f"{prompt}\n\n{_IMAGE_TEXT_GUARD}"


def _format_visual_rules(content: SmmContent) -> tuple[str, str]:
    data = content.input_json if isinstance(content.input_json, dict) else {}
    fmt = str(data.get("content_format") or "Пост").casefold()
    if "карусел" in fmt or "carousel" in fmt:
        return "visual_carousel_style", (
            "Карусель: сохраняй общую палитру, типографику и графическую систему между слайдами; "
            "на каждом слайде одна мысль, достаточно свободного места и короткий читаемый текст."
        )
    if "инфограф" in fmt or "infographic" in fmt:
        return "visual_infographic_style", (
            "Инфографика: ясная иерархия, ограниченное число подтверждённых материалом фактов, "
            "короткие подписи и простые схемы; не выдумывай числа и выводы."
        )
    return "visual_post_style", (
        "Одиночный пост: один главный визуальный акцент; текст публикации остаётся в подписи, "
        "если задание явно не просит надпись на изображении."
    )


async def build_image_prompt(*, db: Session, project: SmmProject, content: SmmContent, user,
                             prompt_override: Optional[str] = None, include_knowledge: bool = True,
                             selected_reference_keys: Optional[list[str]] = None,
                             target_channel: Optional[str] = None) -> str:
    structured = content.output_json if isinstance(content.output_json, dict) else {}
    input_data = content.input_json if isinstance(content.input_json, dict) else {}
    brand = project.brand_context if isinstance(project.brand_context, dict) else {}
    brand_lines = ", ".join(f"{key}: {value}" for key, value in brand.items() if value)
    base_prompt = str(prompt_override or structured.get("image_prompt") or "").strip()
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
    knowledge_items = knowledge_svc.list_items(db, project) if include_knowledge else []
    # Visual identity is intentionally project-local even when a personal
    # social account is allowed to use facts from the other projects.
    wants_character = _requests_character_reference(content)
    selected_project_ids = {
        int(key.split(":", 1)[1]) for key in (selected_reference_keys or [])
        if key.startswith("project:") and key.split(":", 1)[1].isdigit()
    }
    visual_refs = [
        item for item in knowledge_items
        if item.source_type == "image_reference" or (item.content_type or "").startswith("image/")
        if (getattr(item, "visual_role", None) or "style") in {"style", "composition", "example"}
        or (wants_character and getattr(item, "visual_role", None) == "character")
        or item.id in selected_project_ids
    ]
    if selected_reference_keys is not None:
        visual_refs = [item for item in visual_refs if item.id in selected_project_ids]
    visual_block = "\n\n=== РЕФЕРЕНСЫ ВИЗУАЛЬНОГО СТИЛЯ ЭТОГО ПРОЕКТА ===\n" + "\n".join(
        f"[{_VISUAL_ROLE_LABELS.get(getattr(item, 'visual_role', None) or 'style', 'Визуальный ориентир')}: {item.title}] {(item.content or '')[:1400]}"
        for item in visual_refs[:12]
    ) if visual_refs else ""
    content_sources = knowledge_svc.content_items(db, project) if include_knowledge else []
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
    format_key, format_rules = _format_visual_rules(content)
    format_profile = str(brand.get(format_key) or "").strip()
    channel_profile = channel_visual_profile(target_channel)
    prompt = (
        f"{base_prompt}\n\n"
        f"Формат материала: {str(input_data.get('content_format') or 'Пост')}. "
        f"Целевая площадка и холст: {channel_profile['label']}, {channel_profile['dimensions']} px, "
        f"соотношение {channel_profile['aspect_ratio']}. {channel_profile['safe_zone']}.\n"
        f"{format_rules}\n"
        f"Особые правила этого формата проекта: {format_profile or 'не заданы; следуй общему визуальному профилю проекта'}.\n"
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
    db: Session, project: SmmProject, *, content_id: Optional[int] = None, include_details: bool = False,
    selected_reference_keys: Optional[list[str]] = None,
) -> list[dict[str, object]] | tuple[list[dict[str, object]], list[Dict[str, Any]]]:
    """Подготовить разнообразный набор изображений проекта для image-to-image.

    Выбираем разнообразные референсы по размеченным ролям. Персонажные
    референсы доступны только если тема или image prompt явно просит персонажа.
    """
    references: list[dict[str, object]] = []
    reference_details: list[Dict[str, Any]] = []
    total_bytes = 0
    candidates_by_role: dict[str, list[SmmKnowledgeItem]] = {role: [] for role in _VISUAL_ROLE_LABELS}
    project_image_items: list[SmmKnowledgeItem] = []
    wants_character: Optional[bool] = None
    for item in knowledge_svc.list_items(db, project):
        if item.project_id != project.id:
            continue
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
        project_image_items.append(item)
        role = getattr(item, "visual_role", None) or "style"
        if role in {"style", "composition", "example"}:
            candidates_by_role[role].append(item)
        elif role == "character" and content_id is not None and db is not None:
            if wants_character is None:
                content = db.query(SmmContent).filter(SmmContent.id == content_id).first()
                wants_character = _requests_character_reference(content) if content else False
            if wants_character:
                candidates_by_role[role].append(item)

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
    if selected_reference_keys is not None:
        selected_by_key: dict[str, Any] = {
            f"project:{item.id}": item for item in project_image_items if item.id is not None
        }
        selected_by_key.update({
            f"archive:{asset.id}": asset for asset in archived_candidates if asset.id is not None
        })
        unknown = [key for key in selected_reference_keys if key not in selected_by_key]
        if unknown:
            raise ValueError("Выбранный визуальный референс недоступен в этом проекте. Обновите список и повторите.")
        candidates = [selected_by_key[key] for key in dict.fromkeys(selected_reference_keys)]
    else:
        candidates = []
    # If curated visual roles exist, use them as the source of style. Otherwise
    # fall back to this project's own published archive.
    has_curated_roles = any(candidates_by_role.values())
    if selected_reference_keys is None:
        if has_curated_roles:
            archived_candidates = []
        elif archived_candidates:
            start = (max(int(content_id or 1), 1) - 1) % len(archived_candidates)
            archived_candidates = [archived_candidates[start]]

        candidates.extend(archived_candidates)
    item_offset = max(int(content_id or 1), 1) - 1
    role_order = ("character", "style", "composition", "example") if wants_character else ("style", "composition", "example")
    style_limit = 2 if wants_character or candidates_by_role["composition"] or candidates_by_role["example"] else 4
    if selected_reference_keys is None:
        for role in role_order:
            role_items = candidates_by_role[role]
            role_limit = style_limit if role == "style" else 1
            for index in range(min(role_limit, len(role_items))):
                candidates.append(role_items[(item_offset + index) % len(role_items)])

    for item in candidates:
        item_meta = getattr(item, "meta", None)
        content_type = (
            getattr(item, "content_type", None)
            or (item_meta.get("content_type") if isinstance(item_meta, dict) else None)
            or mimetypes.guess_type(getattr(item, "original_filename", None) or "")[0]
            or ("image/png" if isinstance(item, SmmContentAsset) else "")
        ).lower()
        if content_type == "image/jpg":
            content_type = "image/jpeg"
        if not content_type.startswith("image/"):
            content_type = mimetypes.guess_type(getattr(item, "original_filename", None) or "")[0] or "image/png"
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
        if isinstance(item, SmmContentAsset):
            reference_details.append({
                "key": f"archive:{item.id}",
                "source": "published_archive",
                "source_id": item.content_id,
                "title": f"Архив публикаций · материал #{item.content_id}",
                "role": "archive",
                "role_label": "Опубликованный визуал",
            })
        else:
            role = getattr(item, "visual_role", None) or "style"
            reference_details.append({
                "key": f"project:{item.id}",
                "source": "project_reference",
                "source_id": item.id,
                "title": item.title,
                "role": role,
                "role_label": _VISUAL_ROLE_LABELS.get(role, "Визуальный ориентир"),
            })
        total_bytes += len(raw)
    return (references, reference_details) if include_details else references


async def render_image(
    db: Session, user, *, project: SmmProject, content: SmmContent, prompt: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None, selected_reference_keys: Optional[list[str]] = None,
    target_channel: Optional[str] = None,
) -> SmmContentAsset:
    channel_profile = channel_visual_profile(target_channel)
    final_prompt = _with_image_text_guard((await build_image_prompt(
        db=db, project=project, content=content, user=user, prompt_override=prompt,
        include_knowledge=not bool(prompt), selected_reference_keys=selected_reference_keys,
        target_channel=target_channel,
    )).strip())
    if not final_prompt:
        raise ValueError("Нет промпта для генерации изображения")
    if not ai_gateway.is_configured("image"):
        raise ValueError("Генератор изображений не настроен (нет image-провайдера в AI Tunnel)")

    # AITunnel принимает до нескольких input_references для image-to-image.
    # Передаём именно загруженные изображения персонажей/стиля, а не только их OCR/AI-описания.
    references, reference_details = _visual_input_references(
        db, project, content_id=getattr(content, "id", None), include_details=True,
        selected_reference_keys=selected_reference_keys,
    )
    if selected_reference_keys is not None:
        if reference_details:
            labels = ", ".join(f"{item['role_label']}: {item['title']}" for item in reference_details)
            final_prompt += (
                "\n\nПользователь вручную выбрал именно эти визуальные ориентиры. Соблюдай их роли и стиль, "
                "не подменяй их другими проектными референсами: " + labels + "."
            )
            if any(item.get("role") == "character" for item in reference_details):
                final_prompt += " Выбор референса персонажа означает, что персонаж явно разрешён в этой генерации."
        else:
            final_prompt += "\n\nПользователь выбрал генерацию без приложенных визуальных референсов."
    if references and _VISUAL_REFERENCE_GUARD not in final_prompt:
        final_prompt = f"{final_prompt}\n\n{_VISUAL_REFERENCE_GUARD}"
    result = await ai_gateway.generate_image(
        feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
        aspect_ratio=channel_profile["aspect_ratio"], input_references=references or None, user_id=getattr(user, "id", None),
    )
    retried_with_one_reference = False
    if not result.ok and references:
        # Gemini иногда отвечает finish_reason=STOP без картинки и без явного
        # block_reason — не блокировка по политике, а отказ именно совмещать
        # запрос с переданными референсами (часто это реальные фото людей на
        # Не теряем связь с брендом при повторе: уменьшаем набор до одного
        # референса, но не запускаем нерелевантную генерацию без визуального якоря.
        logger.warning("smm render_image retrying with one reference after provider error: %s", result.error)
        retried_with_one_reference = True
        result = await ai_gateway.generate_image(
            feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
            aspect_ratio=channel_profile["aspect_ratio"], input_references=references[:1], user_id=getattr(user, "id", None),
        )
    if not result.ok or not result.data:
        raise ValueError(result.error or "Генератор изображений вернул пустой ответ")

    item: Dict[str, Any] = result.data[0] if isinstance(result.data, list) and result.data else {}
    b64 = item.get("b64_json") if isinstance(item, dict) else None
    url = item.get("url") if isinstance(item, dict) else None

    if not b64 and not url:
        raise ValueError("Генератор изображений вернул ответ без url и без данных файла")

    storage_key = None
    source_bytes = base64.b64decode(b64) if b64 else None
    if not source_bytes and url:
        # Некоторые провайдеры (напр. Gemini через AI Tunnel) возвращают только
        # временный url, без b64_json. Без локальной копии байтов каналы,
        # которым нужен файл, а не ссылка (Telegram/VK/MAX), молча публикуют
        # пост без картинки — attachments остаются пустыми, publish() не
        # падает с ошибкой. Поэтому сразу скачиваем картинку по url и
        # сохраняем как storage_key; для Instagram дальше отдаём публичный URL
        # на нормализованную локальную JPEG-копию.
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url)
                response.raise_for_status()
            source_bytes = response.content
        except Exception as exc:  # noqa: BLE001 — остаёмся на url-only, а не роняем генерацию
            logger.warning("smm asset download failed, keeping url-only: %s", exc)

    asset_meta = dict(meta or {})
    asset_meta["visual_format"] = {
        **channel_profile,
        "target_channel": target_channel,
    }
    asset_meta["content_type"] = "image/jpeg" if target_channel == "instagram" else "image/png"
    if source_bytes:
        try:
            width, height = (int(part) for part in channel_profile["dimensions"].split("×"))
            with Image.open(io.BytesIO(source_bytes)) as image:
                output = ImageOps.fit(
                    image.convert("RGB"), (width, height), method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
                normalized = io.BytesIO()
                if target_channel == "instagram":
                    output.save(normalized, format="JPEG", quality=90, optimize=True, progressive=True)
                    filename = f"content_{content.id}_instagram.jpg"
                else:
                    output.save(normalized, format="PNG", optimize=True)
                    filename = f"content_{content.id}_{target_channel or 'universal'}.png"
            storage_key = storage.save_bytes(normalized.getvalue(), filename)
        except Exception as exc:
            if target_channel == "instagram":
                raise ValueError(f"Не удалось подготовить JPEG для Instagram: {exc}") from exc
            logger.warning("smm image normalization failed; keeping provider url: %s", exc)
    elif target_channel == "instagram":
        raise ValueError("Не удалось скачать изображение, чтобы подготовить публикационный JPEG для Instagram")
    used_reference_details = reference_details[:1] if retried_with_one_reference else reference_details
    asset_meta["visual_references"] = {
        "mode": "project_references" if any(ref["source"] == "project_reference" for ref in used_reference_details)
        else "published_archive" if used_reference_details else "none",
        "references": used_reference_details,
        "sent_count": len(used_reference_details),
        "retried_with_one_reference": retried_with_one_reference,
    }
    if storage_key:
        try:
            brand = project.brand_context if isinstance(project.brand_context, dict) else {}
            image_bytes = storage.read_bytes(storage_key)
            if image_bytes:
                with Image.open(io.BytesIO(image_bytes)) as image:
                    width, height = image.size
                ratio = round(width / height, 4) if height else 0
                check: Dict[str, Any] = {
                    "width": width, "height": height, "ratio": ratio,
                    "expected_ratio": channel_profile["ratio"],
                    "ratio_ok": bool(height and abs(ratio - channel_profile["ratio"]) <= 0.04),
                    "review_status": "not_configured",
                }
                if ai_gateway.is_configured("vision"):
                    with Image.open(io.BytesIO(image_bytes)) as image:
                        normalized = io.BytesIO()
                        image.convert("RGB").save(normalized, format="PNG", optimize=True)
                    data_uri = f"data:image/png;base64,{base64.b64encode(normalized.getvalue()).decode('ascii')}"
                    format_key, _ = _format_visual_rules(content)
                    review = await ai_gateway.analyze_image(
                        feature=f"smm_projects:{project.code}:visual_review", image_url=data_uri,
                        prompt=("Кратко оцени изображение для этого поста по соответствию теме, формату и "
                                "визуальному профилю проекта. Укажи только заметный риск: нечитаемый текст, "
                                "ошибки/псевдотекст, перегруженность или явное несоответствие. В 1-2 фразах.\n"
                                f"Тема: {content.title}\nФормат: {format_key}\n"
                                f"Профиль: {brand.get(format_key, '')}\n"
                                f"Общие правила: {brand.get('visual_style', '')}; {brand.get('visual_palette', '')}"),
                        system="Проверяй только видимые свойства изображения. Не додумывай. Если проблем не видно, ответь: Визуально выглядит согласованно.",
                        max_tokens=140, user_id=getattr(user, "id", None), timeout=15.0,
                    )
                    check["review_status"] = "reviewed" if review.ok else "unavailable"
                    if review.ok:
                        check["review"] = (review.text or "").strip()[:500]
                asset_meta["visual_quality_check"] = check
        except Exception:
            logger.warning("smm visual quality check failed", exc_info=True)
    asset = SmmContentAsset(
        content_id=content.id, asset_type="image", prompt=final_prompt, provider=result.provider,
        model=result.model, url=url if target_channel != "instagram" else None,
        storage_key=storage_key, meta=asset_meta,
        created_by_id=getattr(user, "id", None),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    if target_channel == "instagram" and storage_key:
        public_base = (os.getenv("PORTAL_BASE_URL") or "https://tirskix.space").rstrip("/")
        asset.url = f"{public_base}/api/v1/smm-projects/assets/{asset.id}/file"
        db.commit()
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
