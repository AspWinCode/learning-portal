"""База знаний академии: чанкинг текста для смыслового поиска и авто-описание /
тегирование материалов через AI Tunnel.

Чанки складываются в academy_kb_chunks (колонка embedding появится на этапе
смыслового поиска). Авто-описание — best-effort: если AI Tunnel не настроен или
недоступен, материал сохраняется без описания, ошибка не поднимается.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AcademyKbChunk, AcademyKbEntry
from app.services import ai_gateway
from app.services.academy_ai import storage

_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")

KB_SECTIONS = ("niche", "finance", "marketing", "sales", "clients", "team")
KB_DIRECTIONS = ("программирование", "ОГЭ", "ЕГЭ")


# ─── Чанкинг ───────────────────────────────────────────────────────────────

def chunk_text(text: str, *, target_chars: int = 1200, overlap: int = 150) -> List[str]:
    """Разбивает текст на смысловые фрагменты по абзацам, склеивая короткие и
    деля длинные. Между соседними чанками — небольшое перекрытие."""
    clean = (text or "").strip()
    if not clean:
        return []

    paragraphs = [p.strip() for p in clean.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [clean]

    chunks: List[str] = []
    buffer = ""
    for para in paragraphs:
        if len(para) > target_chars * 1.5:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            for i in range(0, len(para), target_chars):
                chunks.append(para[i : i + target_chars])
            continue
        if not buffer:
            buffer = para
        elif len(buffer) + len(para) + 2 <= target_chars:
            buffer = f"{buffer}\n\n{para}"
        else:
            chunks.append(buffer)
            buffer = para
    if buffer:
        chunks.append(buffer)

    if overlap > 0 and len(chunks) > 1:
        with_overlap: List[str] = [chunks[0]]
        for prev, cur in zip(chunks, chunks[1:]):
            with_overlap.append((prev[-overlap:] + "\n\n" + cur).strip())
        chunks = with_overlap

    return [c for c in chunks if c.strip()]


def _entry_indexable_text(entry: AcademyKbEntry) -> str:
    parts = [entry.title or "", entry.body_text or "", entry.ai_description or ""]
    return "\n\n".join(p for p in parts if p.strip()).strip()


def reindex_entry(db: Session, entry: AcademyKbEntry, *, commit: bool = True) -> int:
    """Пересобирает academy_kb_chunks для записи. Возвращает число чанков."""
    db.query(AcademyKbChunk).filter(AcademyKbChunk.entry_id == entry.id).delete(synchronize_session=False)
    chunks = chunk_text(_entry_indexable_text(entry))
    for ord_, text in enumerate(chunks):
        db.add(AcademyKbChunk(entry_id=entry.id, ord=ord_, text=text, token_count=max(1, len(text) // 4)))
    if commit:
        db.commit()
    return len(chunks)


# ─── Авто-описание и теги ──────────────────────────────────────────────────

_TAG_SYSTEM = (
    "Ты каталогизируешь материалы образовательного бизнеса (академия "
    "программирования и подготовки к ОГЭ/ЕГЭ). Верни только JSON без markdown: "
    '{"summary":"...", "tags":["..."], "section":"niche|finance|marketing|sales|clients|team|null", '
    '"direction":"программирование|ОГЭ|ЕГЭ|null"}. '
    "summary — 1-2 предложения по сути материала. tags — 3-7 коротких тегов на русском."
)


def _parse_enrichment(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    if isinstance(raw.get("summary"), str) and raw["summary"].strip():
        out["summary"] = raw["summary"].strip()[:2000]
    tags = raw.get("tags")
    if isinstance(tags, list):
        out["tags"] = [str(t).strip()[:40] for t in tags if str(t).strip()][:10]
    section = raw.get("section")
    if section in KB_SECTIONS:
        out["section"] = section
    direction = raw.get("direction")
    if direction in KB_DIRECTIONS:
        out["direction"] = direction
    return out


async def _describe_image(entry: AcademyKbEntry, user_id: Optional[int]) -> Optional[str]:
    if not entry.storage_key:
        return None
    content_type = (entry.meta or {}).get("content_type") if isinstance(entry.meta, dict) else None
    data_uri = storage.as_data_uri(entry.storage_key, content_type or "image/jpeg")
    if not data_uri:
        return None
    result = await ai_gateway.analyze_image(
        feature="academy_kb_media",
        image_url=data_uri,
        prompt=(
            "Опиши, что изображено на этом материале академии (фото филиала, "
            "мероприятия, сертификата, скриншота и т.п.). 1-3 предложения, по-русски."
        ),
        user_id=user_id,
    )
    return result.text.strip() if result.ok and result.text else None


async def enrich_entry(db: Session, entry: AcademyKbEntry, *, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Best-effort обогащение записи: описание картинки (vision), summary + теги
    (text). Обновляет запись и переиндексирует чанки. Возвращает что применили."""
    applied: Dict[str, Any] = {}
    meta_ct = (entry.meta or {}).get("content_type") if isinstance(entry.meta, dict) else None

    if entry.kind == "media" and meta_ct in _IMAGE_TYPES:
        description = await _describe_image(entry, user_id)
        if description:
            entry.ai_description = description
            applied["ai_description"] = description

    basis = _entry_indexable_text(entry)
    if basis:
        text_result = await ai_gateway.complete_text(
            feature="academy_kb_tagging",
            system=_TAG_SYSTEM,
            prompt=f"Материал (заголовок «{entry.title}»):\n{basis[:6000]}",
            max_tokens=500,
            json_mode=True,
            user_id=user_id,
        )
        enrichment = _parse_enrichment(text_result.json_object()) if text_result.ok else {}
        if enrichment.get("summary") and not entry.ai_description:
            entry.ai_description = enrichment["summary"]
            applied["ai_description"] = enrichment["summary"]
        if enrichment.get("tags"):
            existing = list(entry.tags or [])
            merged = existing + [t for t in enrichment["tags"] if t not in existing]
            entry.tags = merged[:15]
            applied["tags"] = entry.tags
        if enrichment.get("section") and not entry.section:
            entry.section = enrichment["section"]
            applied["section"] = entry.section
        if enrichment.get("direction") and not entry.direction:
            entry.direction = enrichment["direction"]
            applied["direction"] = entry.direction

    reindex_entry(db, entry, commit=False)
    db.commit()
    db.refresh(entry)
    return applied
