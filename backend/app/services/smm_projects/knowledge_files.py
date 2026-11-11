"""Persistent file context for SMM project knowledge bases."""
from __future__ import annotations

import io
from typing import Tuple

import docx

from app.services import ai_gateway
from app.services.academy_ai.expertise_library import extract_text_sync
from app.services.smm_projects import storage


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown", ".rst", ".html", ".htm", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _docx_text(data: bytes) -> str:
    document = docx.Document(io.BytesIO(data))
    parts = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if values:
                parts.append(" | ".join(values))
    return "\n".join(parts).strip()


async def save_and_extract(data: bytes, filename: str, content_type: str, *, user_id: int | None = None) -> Tuple[str, str]:
    storage_key = storage.save_bytes(data, filename)
    name = (filename or "file").lower()
    try:
        if name.endswith(".docx"):
            text = _docx_text(data)
        elif content_type in ALLOWED_IMAGE_TYPES or name.endswith((".jpg", ".jpeg", ".png", ".webp")):
            uri = storage.as_data_uri(storage_key, content_type or "image/jpeg")
            result = await ai_gateway.analyze_image(
                feature="smm_projects:knowledge_image",
                image_url=uri or "",
                prompt=(
                    "Проанализируй изображение как постоянный референс проекта. "
                    "Опиши видимые объекты, стиль, цвета, композицию, текст на изображении "
                    "и идеи, которые можно безопасно использовать при планировании контента. "
                    "Не придумывай факты, которых не видно. Ответь по-русски."
                ),
                max_tokens=1200,
                user_id=user_id,
            )
            text = result.text.strip() if result.ok and result.text else "Изображение сохранено как визуальный референс проекта."
        else:
            text = extract_text_sync(data, content_type, filename)
        return storage_key, text[:20000]
    except Exception:
        storage.delete(storage_key)
        raise
