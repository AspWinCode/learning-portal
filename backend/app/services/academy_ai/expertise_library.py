"""Библиотека экспертизы: внешние источники (книги, статьи, курсы), которые
расширяют компетенцию консультанта независимо от конкретной академии.

Загруженный источник → извлечение текста → чанкинг в academy_expertise_chunks
(колонка embedding появится на этапе смыслового поиска) → краткое авто-описание.
Для сканов/фото страниц текст распознаётся vision-моделью через AI Tunnel.

Модерация качества (§7.4 концепции): можно посмотреть, что система «прочитала»
(chunks), и отключить источник из выдачи (status=disabled).
"""
from __future__ import annotations

import base64
import io
import os
import zipfile
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AcademyExpertiseChunk, AcademyExpertiseSource
from app.services import ai_gateway
from app.services.academy_ai import storage
from app.services.academy_ai.knowledge_base import chunk_text

_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")


# ─── Извлечение текста ─────────────────────────────────────────────────────

def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception:  # noqa: BLE001
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
    except Exception:  # noqa: BLE001
        return ""


def _strip_html(html: str) -> str:
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text("\n").strip()
    except Exception:  # noqa: BLE001
        return html


def _extract_epub(data: bytes) -> str:
    """EPUB — это zip из xhtml. Разбираем без внешних зависимостей."""
    parts: List[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
            for name in sorted(names):
                try:
                    parts.append(_strip_html(zf.read(name).decode("utf-8", errors="ignore")))
                except Exception:  # noqa: BLE001
                    continue
    except Exception:  # noqa: BLE001
        return ""
    return "\n\n".join(p for p in parts if p).strip()


def extract_text_sync(data: bytes, content_type: str, filename: str) -> str:
    """Синхронное извлечение для форматов без OCR."""
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if "pdf" in ct or name.endswith(".pdf"):
        return _extract_pdf(data)
    if "epub" in ct or name.endswith(".epub"):
        return _extract_epub(data)
    if "html" in ct or name.endswith((".html", ".htm")):
        return _strip_html(data.decode("utf-8", errors="ignore"))
    if ct.startswith("text/") or name.endswith((".txt", ".md", ".markdown", ".rst")):
        return data.decode("utf-8", errors="ignore").strip()
    return ""


async def _ocr_image(storage_key: str, content_type: str, user_id: Optional[int]) -> str:
    data_uri = storage.as_data_uri(storage_key, content_type or "image/jpeg")
    if not data_uri:
        return ""
    result = await ai_gateway.analyze_image(
        feature="academy_expertise_ocr",
        image_url=data_uri,
        prompt=(
            "Распознай и верни весь текст со страницы книги/документа как есть, "
            "без комментариев и пересказа. Сохрани абзацы."
        ),
        max_tokens=2000,
        user_id=user_id,
    )
    return result.text.strip() if result.ok and result.text else ""


_OCR_MAX_PAGES = int(os.getenv("ACADEMY_OCR_MAX_PAGES", "80"))


async def _ocr_scanned_pdf(data: bytes, *, user_id: Optional[int] = None) -> str:
    """Постранично распознаёт текст сканированного PDF (страницы = картинки)
    через vision-модель AI Tunnel. Ограничение — ACADEMY_OCR_MAX_PAGES страниц."""
    try:
        from pypdf import PdfReader
    except Exception:  # noqa: BLE001
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:  # noqa: BLE001
        return ""

    pages_out: List[str] = []
    for idx, page in enumerate(reader.pages):
        if idx >= _OCR_MAX_PAGES:
            pages_out.append(f"\n[…распознано {_OCR_MAX_PAGES} из {len(reader.pages)} страниц]")
            break
        try:
            native = (page.extract_text() or "").strip()
        except Exception:  # noqa: BLE001
            native = ""
        if len(native) > 40:
            pages_out.append(native)
            continue
        try:
            images = list(page.images)
        except Exception:  # noqa: BLE001
            images = []
        if not images:
            if native:
                pages_out.append(native)
            continue
        img = images[0]
        ext = (img.name.rsplit(".", 1)[-1] or "png").lower()
        mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        uri = f"data:{mime};base64,{base64.b64encode(img.data).decode('ascii')}"
        result = await ai_gateway.analyze_image(
            feature="academy_expertise_ocr",
            image_url=uri,
            prompt=(
                "Распознай и верни весь текст с этой страницы книги/документа как "
                "есть, без комментариев и пересказа. Сохрани абзацы."
            ),
            max_tokens=2000,
            user_id=user_id,
        )
        if result.ok and result.text:
            pages_out.append(result.text.strip())

    return "\n\n".join(p for p in pages_out if p).strip()


# ─── Загрузка источника ───────────────────────────────────────────────────

async def ingest_source(
    db: Session, source: AcademyExpertiseSource, *, raw_text: Optional[str] = None, user_id: Optional[int] = None
) -> Dict[str, Any]:
    """Извлекает текст источника, пересобирает чанки, ставит краткое описание.
    Best-effort: при пустом тексте источник остаётся без чанков, ошибка не летит."""
    ocr_used = False
    key = (source.storage_key or "").lower()
    if source.storage_key:
        data = storage.read_bytes(source.storage_key)
        if data is None:
            text = ""
        elif key.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
            ocr_used = True
            text = await _ocr_image(source.storage_key, "image/jpeg", user_id)
        else:
            text = extract_text_sync(data, "", source.storage_key)
            # PDF без текстового слоя (скан) → постраничный OCR
            if len(text) < 40 and (key.endswith(".pdf") or data[:5] == b"%PDF-"):
                ocr_text = await _ocr_scanned_pdf(data, user_id=user_id)
                if ocr_text:
                    ocr_used = True
                    text = ocr_text
    else:
        text = (raw_text or "").strip()

    chunks = chunk_text(text, target_chars=1400, overlap=180) if text else []

    db.query(AcademyExpertiseChunk).filter(AcademyExpertiseChunk.source_id == source.id).delete(
        synchronize_session=False
    )
    for ord_, piece in enumerate(chunks):
        db.add(
            AcademyExpertiseChunk(
                source_id=source.id, ord=ord_, text=piece, token_count=max(1, len(piece) // 4)
            )
        )

    if chunks and not source.ai_description:
        summary = await ai_gateway.complete_text(
            feature="academy_expertise_summary",
            system="Ты кратко описываешь источник знаний по бизнесу/маркетингу. 1-2 предложения, по-русски.",
            prompt=f"Название: {source.title}\n\nНачало текста:\n{text[:4000]}",
            max_tokens=250,
            user_id=user_id,
        )
        if summary.ok and summary.text:
            source.ai_description = summary.text.strip()[:2000]

    db.commit()
    db.refresh(source)
    return {
        "chars_extracted": len(text),
        "chunks": len(chunks),
        "ocr_used": ocr_used,
    }


def set_status(db: Session, source: AcademyExpertiseSource, status: str) -> AcademyExpertiseSource:
    if status not in ("active", "disabled"):
        raise ValueError("status must be active|disabled")
    source.status = status
    db.commit()
    db.refresh(source)
    return source


def chunk_preview(db: Session, source_id: int, *, limit: int = 20, offset: int = 0) -> List[AcademyExpertiseChunk]:
    return (
        db.query(AcademyExpertiseChunk)
        .filter(AcademyExpertiseChunk.source_id == source_id)
        .order_by(AcademyExpertiseChunk.ord)
        .offset(offset)
        .limit(limit)
        .all()
    )
