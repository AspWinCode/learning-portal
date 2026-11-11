"""Persistent file context for SMM project knowledge bases."""
from __future__ import annotations

import io
import os
import zipfile
from typing import Tuple

import docx

from app.services import ai_gateway
from app.services.academy_ai.expertise_library import extract_text_sync
from app.services.smm_projects import storage


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown", ".rst", ".html", ".htm", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_ARCHIVE_FILES = int(os.getenv("SMM_MAX_ARCHIVE_FILES", "200"))
MAX_ARCHIVE_UNCOMPRESSED_BYTES = int(os.getenv("SMM_MAX_ARCHIVE_UNCOMPRESSED_BYTES", str(200 * 1024 * 1024)))


def unpack_archive(data: bytes) -> list[tuple[str, bytes]]:
    """Safely unpack supported files from a ZIP without allowing path traversal or bombs."""
    if len(data) > storage.MAX_UPLOAD_BYTES:
        raise ValueError(f"Размер ZIP не должен превышать {storage.MAX_UPLOAD_BYTES} байт")
    files: list[tuple[str, bytes]] = []
    total_size = 0
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("Файл не является корректным ZIP-архивом") from exc
    with archive:
        for info in archive.infolist():
            if info.is_dir() or not info.filename:
                continue
            name = info.filename.replace("\\", "/")
            parts = [part for part in name.split("/") if part not in ("", ".")]
            if not parts or ".." in parts or name.startswith("/"):
                continue
            filename = parts[-1]
            if os.path.splitext(filename.lower())[1] not in ALLOWED_EXTENSIONS:
                continue
            if info.flag_bits & 0x1:
                continue
            if info.file_size > storage.MAX_UPLOAD_BYTES:
                continue
            total_size += info.file_size
            if len(files) >= MAX_ARCHIVE_FILES:
                raise ValueError(f"В ZIP больше {MAX_ARCHIVE_FILES} поддерживаемых файлов")
            if total_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                raise ValueError("Распакованный размер ZIP превышает допустимый лимит")
            files.append((filename, archive.read(info)))
    if not files:
        raise ValueError("В ZIP не найдено поддерживаемых документов или изображений")
    return files


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
