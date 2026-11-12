"""Генерация визуалов — отдельная сущность от текстового контента."""
from __future__ import annotations

import base64
import logging
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from app.models import SmmContent, SmmContentAsset, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import storage

logger = logging.getLogger(__name__)


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
    prompt = (
        f"{base_prompt}\n\n"
        "Это обязательный постоянный контекст проекта. Сохрани узнаваемый мир, персонажей, "
        "цветовую палитру и визуальный язык КодАрены. Не заменяй их абстрактным стоковым дизайном. "
        "Не добавляй надписи в изображение."
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


async def render_image(
    db: Session, user, *, project: SmmProject, content: SmmContent, prompt: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> SmmContentAsset:
    final_prompt = (prompt or await build_image_prompt(db=db, project=project, content=content, user=user)).strip()
    if not final_prompt:
        raise ValueError("Нет промпта для генерации изображения")
    if not ai_gateway.is_configured("image"):
        raise ValueError("Генератор изображений не настроен (нет image-провайдера в AI Tunnel)")

    result = await ai_gateway.generate_image(
        feature=f"smm_projects:{project.code}:render_image", prompt=final_prompt, user_id=getattr(user, "id", None),
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
