"""Генерация контента для клиентов на основе базы знаний академии.

Первоисточник фактов — база знаний + библиотека экспертизы + (по релевантности)
реальные цифры LMS. Система явно помечает, какие факты взяты из базы знаний, а
какие — типовые формулировки. Результат — черновик в academy_content_drafts со
status=draft. Автопубликации нет — только очередь на проверку человеком.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import AcademyContentDraft, AcademyContentDraftStatus
from app.services import ai_gateway
from app.services.academy_ai import lms_context, retrieval
from app.services.academy_ai.orchestrator import _select_lms_tools

# kind -> (инструкция, ждём JSON {title,body,image_prompt}?, max_tokens)
_KIND_SPECS: Dict[str, Dict[str, Any]] = {
    "post": {
        "instruction": (
            "Сделай пост для соцсетей академии. Структура: хук → польза → призыв к действию. "
            "Верни JSON без markdown: {\"title\":\"...\",\"body\":\"...\",\"image_prompt\":\"...\"}. "
            "image_prompt — подробное описание картинки в стилистике бренда, по-русски."
        ),
        "json": True,
        "max_tokens": 1200,
    },
    "summary": {
        "instruction": (
            "Сделай короткое презентационное описание услуги/курса для клиента "
            "на основе загруженной программы и цен. Только текст, без markdown."
        ),
        "json": False,
        "max_tokens": 900,
    },
    "image_prompt": {
        "instruction": (
            "Составь детальный текстовый промпт для генератора изображений "
            "(Midjourney/DALL·E) в стилистике бренда академии. Только промпт."
        ),
        "json": False,
        "max_tokens": 500,
    },
    "newsletter": {
        "instruction": (
            "Напиши текст для email-рассылки. Верни JSON без markdown: "
            "{\"title\":\"...\",\"body\":\"...\",\"image_prompt\":\"...\"}."
        ),
        "json": True,
        "max_tokens": 1400,
    },
    "script": {
        "instruction": (
            "Напиши сценарий для короткого видео/сторис (по репликам и кадрам). "
            "Верни JSON без markdown: {\"title\":\"...\",\"body\":\"...\",\"image_prompt\":\"...\"}."
        ),
        "json": True,
        "max_tokens": 1200,
    },
}

VALID_KINDS = tuple(_KIND_SPECS)

_SYSTEM = (
    "Ты — генератор контента онлайн-академии программирования и подготовки к "
    "ОГЭ/ЕГЭ. Пиши по-русски. Факты (цены, числа учеников, результаты, названия "
    "курсов) бери ТОЛЬКО из предоставленного контекста базы знаний и данных LMS. "
    "Если факта нет — не выдумывай, используй нейтральную формулировку. В конце "
    "ответа добавь строку «Источники фактов: ...» — перечисли, что взято из базы "
    "знаний, а что является типовой формулировкой."
)


def _tone_hint(tone: Optional[Dict[str, Any]]) -> str:
    if not isinstance(tone, dict) or not tone:
        return ""
    bits = []
    if tone.get("voice"):
        bits.append(f"tone of voice: {tone['voice']}")
    if tone.get("length"):
        bits.append(f"объём: {tone['length']}")
    if "emoji" in tone:
        bits.append("с эмодзи" if tone.get("emoji") else "без эмодзи")
    return ("; ".join(bits)) if bits else ""


async def _build_context(db: Session, user, query: str) -> Dict[str, Any]:
    hits = await retrieval.search(db, query, scopes=("kb", "expertise"), k=8, user_id=getattr(user, "id", None))
    used: Dict[str, Any] = {
        "kb": [{"title": h.title, "score": round(h.score, 3)} for h in hits if h.scope == "kb"],
        "expertise": [{"title": h.title, "score": round(h.score, 3)} for h in hits if h.scope == "expertise"],
        "lms": [],
    }
    blocks: List[str] = []
    kb_hits = [h for h in hits if h.scope == "kb"]
    if kb_hits:
        blocks.append("=== БАЗА ЗНАНИЙ АКАДЕМИИ ===\n" + "\n\n".join(f"[{h.title}] {h.text[:900]}" for h in kb_hits[:5]))
    exp_hits = [h for h in hits if h.scope == "expertise"]
    if exp_hits:
        blocks.append("=== МЕТОДИКА ===\n" + "\n\n".join(f"[{h.title}] {h.text[:700]}" for h in exp_hits[:3]))

    if user is not None and getattr(user, "role", None):
        for tool_name in _select_lms_tools(query, user)[:2]:
            result = lms_context.run_tool(tool_name, db, user)
            if "data" in result:
                used["lms"].append(tool_name)
                blocks.append(f"=== LMS [{tool_name}] ===\n{result['data']}")

    used["context_text"] = "\n\n".join(blocks) if blocks else "(контекст не найден)"
    return used


async def generate(
    db: Session,
    user,
    *,
    kind: str,
    brief: str,
    direction: Optional[str] = None,
    tone: Optional[Dict[str, Any]] = None,
    schedule_rule_id: Optional[int] = None,
) -> AcademyContentDraft:
    if kind not in _KIND_SPECS:
        raise ValueError(f"kind must be one of {VALID_KINDS}")
    spec = _KIND_SPECS[kind]

    query = " ".join(p for p in (brief, direction or "") if p)
    ctx = await _build_context(db, user, query)

    tone_line = _tone_hint(tone)
    prompt = (
        f"{spec['instruction']}\n\n"
        f"{'Направление: ' + direction if direction else ''}\n"
        f"{'Пожелания к стилю: ' + tone_line if tone_line else ''}\n\n"
        f"Задание: {brief}\n\n"
        f"Контекст:\n{ctx['context_text']}"
    )

    title: Optional[str] = None
    body: str = ""
    image_prompt: Optional[str] = None

    if ai_gateway.is_configured("text"):
        result = await ai_gateway.complete_text(
            feature="academy_content_gen",
            system=_SYSTEM,
            prompt=prompt,
            max_tokens=spec["max_tokens"],
            temperature=0.6,
            json_mode=spec["json"],
            user_id=getattr(user, "id", None),
        )
        if result.ok and result.text:
            if spec["json"]:
                parsed = result.json_object() or {}
                title = (parsed.get("title") or "").strip()[:256] or None
                body = str(parsed.get("body") or "").strip()
                image_prompt = (parsed.get("image_prompt") or "").strip() or None
            else:
                body = result.text.strip()
    if not body:
        body = f"[AI Tunnel недоступен] Черновик «{kind}» по брифу: {brief}"

    if kind == "image_prompt" and not image_prompt:
        image_prompt = body

    draft = AcademyContentDraft(
        kind=kind,
        status=AcademyContentDraftStatus.DRAFT.value,
        title=title or brief.strip()[:256],
        body=body,
        image_prompt=image_prompt,
        based_on={k: v for k, v in ctx.items() if k != "context_text"},
        direction=direction,
        schedule_rule_id=schedule_rule_id,
        created_by_id=getattr(user, "id", None),
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


async def render_image(db: Session, draft: AcademyContentDraft, *, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Сгенерировать картинку по draft.image_prompt через AI Tunnel и сохранить
    ссылку/ключ. Возвращает {ok, detail}."""
    from app.services.academy_ai import storage

    prompt = (draft.image_prompt or draft.body or "").strip()
    if not prompt:
        return {"ok": False, "detail": "нет image_prompt"}
    result = await ai_gateway.generate_image(feature="academy_content_image", prompt=prompt, user_id=user_id)
    if not result.ok or not result.data:
        return {"ok": False, "detail": result.error or "генератор изображений недоступен"}

    item = result.data[0] if isinstance(result.data, list) else {}
    b64 = item.get("b64_json") if isinstance(item, dict) else None
    url = item.get("url") if isinstance(item, dict) else None
    if b64:
        import base64

        draft.image_storage_key = storage.save_bytes(base64.b64decode(b64), f"draft_{draft.id}.png")
    elif url:
        draft.image_storage_key = None
        meta = dict(draft.based_on or {})
        meta["image_url"] = url
        draft.based_on = meta
    else:
        return {"ok": False, "detail": "пустой ответ генератора"}
    db.commit()
    db.refresh(draft)
    return {"ok": True, "detail": "изображение сохранено"}


def set_status(
    db: Session, draft: AcademyContentDraft, status: str, *, feedback: Optional[str] = None
) -> AcademyContentDraft:
    valid = {s.value for s in AcademyContentDraftStatus}
    if status not in valid:
        raise ValueError(f"status must be one of {sorted(valid)}")
    draft.status = status
    if feedback is not None:
        draft.feedback_note = feedback
    db.commit()
    db.refresh(draft)
    return draft
