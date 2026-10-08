"""Генерация визуалов (п.27 ТЗ) — отдельная сущность от текстового контента.

Текстовый контент и image asset не смешиваются в одной строке: AiGeneratedAsset
ссылается на AiGeneratedContent, но не подменяет его output_text. Если
image-gateway недоступен/не настроен — возвращаем понятную ошибку, не падаем
молча (в отличие от текстовой генерации, где есть текстовый fallback, для
картинки осмысленного fallback нет)."""
from __future__ import annotations

import base64
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import AiGeneratedAsset, AiGeneratedContent, AiWorkspace
from app.services import ai_gateway
from app.services.ai_studio import storage


async def build_image_prompt(*, workspace: AiWorkspace, content: AiGeneratedContent, user) -> str:
    """Build a visual-only prompt from facts and workspace brand profile."""
    structured = content.output_json if isinstance(content.output_json, dict) else {}
    if structured.get("image_prompt"):
        return str(structured["image_prompt"]).strip()
    brand = workspace.brand_context if isinstance(workspace.brand_context, dict) else {}
    brand_lines = ", ".join(f"{key}: {value}" for key, value in brand.items() if value)
    prompt = (
        "Создай визуальный промпт для social media изображения. Не рисуй текст, даты, цены или логотипы. "
        "Опирайся только на факты материала. Укажи композицию, настроение и тип визуала.\n"
        f"Бренд: {brand_lines or 'не задан'}\n"
        f"Тип материала: {content.title or 'social post'}\n"
        f"Факты: {content.output_text or content.title or ''}"
    )
    if not ai_gateway.is_configured("text"):
        return prompt
    result = await ai_gateway.complete_text(
        feature=f"ai_studio:{workspace.code}:image_prompt",
        system="Верни только короткий промпт для генератора изображений без пояснений.",
        prompt=prompt,
        user_id=getattr(user, "id", None),
        temperature=0.4,
        max_tokens=500,
    )
    return (result.text or prompt).strip() if result.ok else prompt


async def render_image(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    content: AiGeneratedContent,
    prompt: Optional[str] = None,
) -> AiGeneratedAsset:
    final_prompt = (prompt or await build_image_prompt(workspace=workspace, content=content, user=user)).strip()
    if not final_prompt:
        raise ValueError("Нет промпта для генерации изображения")
    if not ai_gateway.is_configured("image"):
        raise ValueError("Генератор изображений не настроен (нет image-провайдера в AI Tunnel)")

    result = await ai_gateway.generate_image(
        feature=f"ai_studio:{workspace.code}:render_image",
        prompt=final_prompt,
        user_id=getattr(user, "id", None),
    )
    if not result.ok or not result.data:
        raise ValueError(result.error or "Генератор изображений вернул пустой ответ")

    item: Dict[str, Any] = result.data[0] if isinstance(result.data, list) and result.data else {}
    b64 = item.get("b64_json") if isinstance(item, dict) else None
    url = item.get("url") if isinstance(item, dict) else None

    storage_key = None
    if b64:
        storage_key = storage.save_bytes(base64.b64decode(b64), f"content_{content.id}.png")
    elif not url:
        raise ValueError("Генератор изображений вернул ответ без url и без данных файла")

    asset = AiGeneratedAsset(
        content_id=content.id,
        asset_type="image",
        prompt=final_prompt,
        provider=result.provider,
        model=result.model,
        url=url,
        storage_key=storage_key,
        created_by_id=getattr(user, "id", None),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def list_assets(db: Session, content: AiGeneratedContent):
    return (
        db.query(AiGeneratedAsset)
        .filter(AiGeneratedAsset.content_id == content.id)
        .order_by(AiGeneratedAsset.created_at.desc())
        .all()
    )


def select_asset(db: Session, content: AiGeneratedContent, asset_id: int) -> AiGeneratedAsset:
    asset = db.query(AiGeneratedAsset).filter(AiGeneratedAsset.id == asset_id, AiGeneratedAsset.content_id == content.id).first()
    if asset is None:
        raise ValueError("Visual не принадлежит материалу")
    db.query(AiGeneratedAsset).filter(AiGeneratedAsset.content_id == content.id).update({"is_selected": False}, synchronize_session=False)
    asset.is_selected = True
    content.selected_asset_id = asset.id
    db.commit()
    db.refresh(asset)
    return asset
