"""Разбивка задачи owner-а на подзадачи через ИИ.

Провайдер-агностично: все обращения к моделям идут через app.services.ai_gateway
(AI Tunnel). Если ни один провайдер не сконфигурирован или ответ невалиден —
возвращаем None, а вызывающий код (routers/tasks.py) откатывается на эвристику.
"""
from typing import Any, Dict, List, Optional, Tuple

from app.services import ai_gateway


def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    return ai_gateway._parse_json_object(text)


def _normalize_priority(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"low", "normal", "high"}:
        return raw
    if raw in {"medium", "normal_priority", "default"}:
        return "normal"
    if raw in {"critical", "urgent"}:
        return "high"
    return "normal"


def normalize_ai_breakdown(value: Dict[str, Any], fallback_text: str, fallback_category: str) -> Optional[Dict[str, Any]]:
    title = str(value.get("title") or "").strip()
    if not title:
        return None
    description = str(value.get("description") or fallback_text).strip()
    category = str(value.get("category") or fallback_category).strip()
    if category not in {"schools", "parents", "leads"}:
        category = fallback_category if fallback_category in {"schools", "parents", "leads"} else "schools"

    raw_subtasks = value.get("subtasks")
    subtasks: List[Dict[str, Any]] = []
    if isinstance(raw_subtasks, list):
        for index, item in enumerate(raw_subtasks[:12]):
            text = ""
            if isinstance(item, dict):
                text = str(item.get("text") or item.get("title") or "").strip()
            elif isinstance(item, str):
                text = item.strip()
            if text:
                subtasks.append({"text": text[:220], "order": index})

    if len(subtasks) < 2:
        return None

    return {
        "title": title[:160],
        "description": description[:4000] or fallback_text,
        "category": category,
        "priority": _normalize_priority(value.get("priority")),
        "subtasks": subtasks,
    }


def _task_breakdown_prompts(text: str, category: str) -> Tuple[str, str]:
    system_prompt = (
        "Ты помощник owner-а в таск-трекере школы программирования. "
        "Разложи пользовательскую задачу на конкретные проверяемые подзадачи. "
        "Верни только JSON без markdown: "
        '{"title":"...","description":"...","category":"schools|parents|leads",'
        '"priority":"low|normal|high","subtasks":[{"text":"...","order":0}]}. '
        "Не добавляй выдуманные даты, имена или ответственных. Пиши по-русски."
    )
    user_prompt = (
        f"Категория по умолчанию: {category}.\n"
        f"Задача owner-а:\n{text}\n\n"
        "Сделай 4-8 подзадач. Первая подзадача должна уточнять критерий готовности, "
        "последняя - проверку результата."
    )
    return system_prompt, user_prompt


async def build_task_breakdown_with_ai(text: str, category: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    system_prompt, user_prompt = _task_breakdown_prompts(text, category)
    result = await ai_gateway.complete_text(
        feature="task_breakdown",
        system=system_prompt,
        prompt=user_prompt,
        max_tokens=1200,
        temperature=0.2,
        json_mode=True,
    )
    if not result.ok or not result.text:
        return None, None

    parsed = _parse_json_object(result.text)
    if not parsed:
        return None, None

    normalized = normalize_ai_breakdown(parsed, fallback_text=text, fallback_category=category)
    if not normalized:
        return None, None
    return normalized, (result.provider or "ai")
