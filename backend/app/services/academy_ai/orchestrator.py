"""Ядро оркестрации ИИ-консультанта: приём запроса → сбор контекста
(методология из библиотеки экспертизы + факты из базы знаний академии + данные
LMS) → ответ через AI Tunnel с явными пометками источников → журнал диалога.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import AcademyDialog, AcademyMessage
from app.services import ai_gateway
from app.services.academy_ai import lms_context, retrieval

_HISTORY_LIMIT = 6
_RETRIEVAL_K = 8

# Ключевые слова запроса → инструмент LMS. Инструмент вызывается только если он
# доступен пользователю по правам (проверка внутри lms_context.run_tool).
_LMS_KEYWORDS: List[Tuple[str, tuple]] = [
    ("finance_summary", ("финанс", "выручк", "прибыл", "рентабельн", "расход", "доход", "деньг", "оборот", "маржа", "юнит")),
    ("schools_directory", ("школ", "партнёр", "партнер", "b2b", "директор", "лицей", "гимназ")),
    ("students_overview", ("ученик", "учеников", "отток", "приток", "клиент", "набор")),
    ("groups_load", ("групп", "наполняем", "загрузк", "недобор", "расписан")),
    ("programs_catalog", ("программ", "курс", "модул", "направлен")),
    ("sales_funnel", ("воронк", "лид", "лиды", "конверси", "продаж", "заявк")),
    ("reviews_summary", ("отзыв", "характеристик", "удержан", "nps", "лояльн")),
]

_SYSTEM_PROMPT = (
    "Ты — персональный консультант онлайн-академии программирования и подготовки "
    "к ОГЭ/ЕГЭ по вопросам управления: стратегия, финансы, маркетинг, продажи, "
    "команда. Отвечай по-русски, конкретно и структурно.\n\n"
    "Тебе даны три вида контекста. В ответе ЯВНО помечай, откуда факт:\n"
    "  [методика] — общие принципы из библиотеки экспертизы;\n"
    "  [база знаний] — сохранённые факты об этой академии;\n"
    "  [LMS] — актуальные цифры из системы (финансы, ученики, школы и т.п.).\n"
    "Если по вопросу нет данных в контексте — так и скажи, не выдумывай цифры, "
    "имена и даты. Типовые формулировки помечать не нужно."
)


def _select_lms_tools(message: str, user) -> List[str]:
    text = (message or "").lower()
    picked: List[str] = []
    for tool_name, keywords in _LMS_KEYWORDS:
        if any(kw in text for kw in keywords) and tool_name not in picked:
            picked.append(tool_name)
    available = {t["name"] for t in lms_context.available_tools(user)}
    return [t for t in picked if t in available][:3]


def _get_or_create_dialog(db: Session, user, dialog_id: Optional[int]) -> AcademyDialog:
    if dialog_id:
        dialog = db.query(AcademyDialog).filter(AcademyDialog.id == dialog_id).first()
        if dialog:
            return dialog
    dialog = AcademyDialog(kind="consult", user_id=getattr(user, "id", None))
    db.add(dialog)
    db.commit()
    db.refresh(dialog)
    return dialog


def _history_text(db: Session, dialog_id: int) -> str:
    rows = (
        db.query(AcademyMessage)
        .filter(AcademyMessage.dialog_id == dialog_id)
        .order_by(AcademyMessage.id.desc())
        .limit(_HISTORY_LIMIT)
        .all()
    )
    rows.reverse()
    lines = [f"{'Владелец' if m.role == 'user' else 'Консультант'}: {(m.content or '')[:600]}" for m in rows]
    return "\n".join(lines)


async def _gather_context(
    db: Session, user, message: str
) -> Tuple[str, Dict[str, Any]]:
    hits = await retrieval.search(db, message, scopes=("expertise", "kb"), k=_RETRIEVAL_K, user_id=getattr(user, "id", None))
    expertise_hits = [h for h in hits if h.scope == "expertise"]
    kb_hits = [h for h in hits if h.scope == "kb"]

    used: Dict[str, Any] = {
        "expertise": [{"title": h.title, "score": round(h.score, 3)} for h in expertise_hits],
        "kb": [{"title": h.title, "score": round(h.score, 3)} for h in kb_hits],
        "lms": [],
        "retrieval_backend": retrieval.search_backend(db),
    }

    blocks: List[str] = []
    if expertise_hits:
        joined = "\n\n".join(f"[{h.title}] {h.text[:900]}" for h in expertise_hits[:5])
        blocks.append(f"=== МЕТОДИКА (библиотека экспертизы) ===\n{joined}")
    if kb_hits:
        joined = "\n\n".join(f"[{h.title}] {h.text[:900]}" for h in kb_hits[:5])
        blocks.append(f"=== БАЗА ЗНАНИЙ АКАДЕМИИ ===\n{joined}")

    lms_blocks: List[str] = []
    for tool_name in _select_lms_tools(message, user):
        result = lms_context.run_tool(tool_name, db, user)
        if "data" in result:
            used["lms"].append(tool_name)
            lms_blocks.append(f"[{tool_name}] {result['data']}")
    if lms_blocks:
        blocks.append("=== ДАННЫЕ LMS (актуальные) ===\n" + "\n\n".join(lms_blocks))

    return ("\n\n".join(blocks) if blocks else "(контекст не найден)"), used


def _degraded_answer(context_used: Dict[str, Any]) -> str:
    parts = ["AI Tunnel не настроен — не могу дать развёрнутый ответ. Что нашлось по запросу:"]
    if context_used["expertise"]:
        parts.append("• методика: " + ", ".join(s["title"] for s in context_used["expertise"][:5]))
    if context_used["kb"]:
        parts.append("• база знаний: " + ", ".join(s["title"] for s in context_used["kb"][:5]))
    if context_used["lms"]:
        parts.append("• данные LMS: " + ", ".join(context_used["lms"]))
    if len(parts) == 1:
        parts.append("(ничего релевантного не найдено)")
    return "\n".join(parts)


async def consult(
    db: Session, user, *, message: str, dialog_id: Optional[int] = None
) -> Dict[str, Any]:
    dialog = _get_or_create_dialog(db, user, dialog_id)
    context, used_sources = await _gather_context(db, user, message)
    history = _history_text(db, dialog.id)

    db.add(AcademyMessage(dialog_id=dialog.id, role="user", content=message))
    db.commit()

    if not ai_gateway.is_configured("text"):
        answer = _degraded_answer(used_sources)
    else:
        prompt_parts = []
        if history:
            prompt_parts.append(f"История диалога:\n{history}")
        prompt_parts.append(f"Контекст:\n{context}")
        prompt_parts.append(f"Вопрос владельца:\n{message}")
        result = await ai_gateway.complete_text(
            feature="academy_consult",
            system=_SYSTEM_PROMPT,
            prompt="\n\n".join(prompt_parts),
            max_tokens=1500,
            temperature=0.3,
            user_id=getattr(user, "id", None),
        )
        answer = result.text.strip() if result.ok and result.text else _degraded_answer(used_sources)

    db.add(
        AcademyMessage(dialog_id=dialog.id, role="assistant", content=answer, used_sources=used_sources)
    )
    if not dialog.title:
        dialog.title = message.strip()[:120]
    db.commit()

    return {"dialog_id": dialog.id, "answer": answer, "used_sources": used_sources}
