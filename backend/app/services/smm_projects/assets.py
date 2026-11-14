"""Генерация визуалов — отдельная сущность от текстового контента."""
from __future__ import annotations

import base64
import io
import mimetypes
import logging
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session
from PIL import Image

from app.models import SmmContent, SmmContentAsset, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import storage

logger = logging.getLogger(__name__)

# Визуальный вариант выбирается детерминированно по материалу, чтобы разные
# публикации не получали одного и того же героя. При этом слайды одной
# карусели сохраняют общий образ — разнообразие нужно между публикациями.
_CHARACTER_VARIANTS = (
    "быстрый разведчик в лёгкой броне, динамичный силуэт и светло-синие акценты",
    "мудрый маг-аналитик в длинной мантии, фиолетово-золотая палитра",
    "механик-изобретатель с защитными очками и медными деталями",
    "лучница-стратег с плащом и бирюзовыми световыми эффектами",
    "робот-тактик с геометричной бронёй и красными сигнальными огнями",
    "тёмный рыцарь-защитник с массивным щитом и синим свечением",
    "исследовательница данных с голографическими интерфейсами и зелёными акцентами",
    "ловкий кибер-ниндзя с чёрно-оранжевой палитрой и другим силуэтом",
)


def _character_variant(content_id: Optional[int]) -> str:
    index = (int(content_id or 0) - 1) % len(_CHARACTER_VARIANTS)
    return _CHARACTER_VARIANTS[index]


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
    visual_refs = [
        item for item in knowledge_items
        if item.source_type == "image_reference" or (item.content_type or "").startswith("image/")
    ]
    visual_block = "\n\n=== ВИЗУАЛЬНЫЕ РЕФЕРЕНСЫ КОДАРЕНЫ ===\n" + "\n".join(
        f"[{item.title}] {(item.content or '')[:1400]}" for item in visual_refs[:12]
    ) if visual_refs else ""
    context_block = knowledge_svc.as_prompt_block(knowledge_items[:12], max_chars=7000) if knowledge_items else ""
    character_variant = _character_variant(getattr(content, "id", None))
    prompt = (
        f"{base_prompt}\n\n"
        "Это обязательный постоянный контекст проекта. Сохрани узнаваемый мир, персонажей, "
        "цветовую палитру и визуальный язык КодАрены. Не заменяй их абстрактным стоковым дизайном. "
        f"Для этой публикации используй отдельного героя: {character_variant}. "
        "Не копируй главного героя с предыдущих публикаций и не повторяй один и тот же силуэт, "
        "одежду или цветовую комбинацию; разнообразь персонажей между постами. "
        "Если в изображении есть подписи, заголовки или другие слова, пиши их только на русском языке, "
        "кириллицей, без английских букв. Не вставляй английский текст. "
        f"{visual_block}{context_block}"
    )
    if not ai_gateway.is_configured("text"):
        return prompt
    result = await ai_gateway.complete_text(
        feature=f"smm_projects:{project.code}:image_prompt",
        system="Верни только короткий промпт для генератора изображений без пояснений.",
        prompt=prompt, user_id=getattr(user, "id", None), temperature=0.4, max_tokens=500,
    )
    return (result.text or prompt).strip() if result.ok else prompt


def _visual_input_references(db: Session, project: SmmProject) -> list[dict[str, object]]:
    """Подготовить реальные изображения проекта для AITunnel image-to-image."""
    references: list[dict[str, object]] = []
    total_bytes = 0
    for item in knowledge_svc.list_items(db, project):
        if len(references) >= 4:
            break
        if item.source_type != "image_reference" and not (item.content_type or "").startswith("image/"):
            continue
        if not item.storage_key:
            continue
        content_type = (item.content_type or mimetypes.guess_type(item.original_filename or "")[0] or "").lower()
        if content_type == "image/jpg":
            content_type = "image/jpeg"
        if content_type not in {"image/png", "image/jpeg", "image/webp"}:
            continue
        raw = storage.read_bytes(item.storage_key)
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
    final_prompt = (prompt or await build_image_prompt(db=db, project=project, content=content, user=user)).strip()
    if not final_prompt:
        raise ValueError("Нет промпта для генерации изображения")
    if not ai_gateway.is_configured("image"):
        raise ValueError("Генератор изображений не настроен (нет image-провайдера в AI Tunnel)")

    # AITunnel принимает до нескольких input_references для image-to-image.
    # Передаём именно загруженные изображения персонажей/стиля, а не только их OCR/AI-описания.
    references = _visual_input_references(db, project)
    result = await ai_gateway.generate_image(
        feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
        input_references=references or None, user_id=getattr(user, "id", None),
    )
    if not result.ok and references:
        # Gemini иногда отвечает finish_reason=STOP без картинки и без явного
        # block_reason — не блокировка по политике, а отказ именно совмещать
        # запрос с переданными референсами (часто это реальные фото людей на
        # турнирных фотографиях). Явного флага для этого нет, поэтому просто
        # пробуем тот же промпт без референсов, прежде чем показывать ошибку.
        logger.warning("smm render_image retrying without references after provider error: %s", result.error)
        result = await ai_gateway.generate_image(
            feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt,
            user_id=getattr(user, "id", None),
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
