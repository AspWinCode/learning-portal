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


async def render_image(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    content: AiGeneratedContent,
    prompt: Optional[str] = None,
) -> AiGeneratedAsset:
    final_prompt = (prompt or content.output_text or content.title or "").strip()
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
