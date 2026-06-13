import json
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx


ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_RANVIK_BASE_URL = "https://api.ranvik.ru/v1"
DEFAULT_RANVIK_MODEL = "claude-haiku-4-5"


def _extract_anthropic_text(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    parts: List[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts).strip()


def _extract_openai_text(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    text = first.get("text")
    return text.strip() if isinstance(text, str) else ""


def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            value = json.loads(raw[start : end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None


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


async def build_task_breakdown_with_ranvik(text: str, category: str) -> Optional[Dict[str, Any]]:
    api_key = (os.getenv("RANVIK_API_KEY") or "").strip()
    if not api_key:
        return None

    base_url = (os.getenv("RANVIK_BASE_URL") or DEFAULT_RANVIK_BASE_URL).strip().rstrip("/")
    model = (os.getenv("RANVIK_MODEL") or DEFAULT_RANVIK_MODEL).strip()
    system_prompt, user_prompt = _task_breakdown_prompts(text, category)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 1200,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
    except httpx.HTTPError:
        return None

    parsed = _parse_json_object(_extract_openai_text(response.json()))
    if not parsed:
        return None
    return normalize_ai_breakdown(parsed, fallback_text=text, fallback_category=category)


async def build_task_breakdown_with_claude(text: str, category: str) -> Optional[Dict[str, Any]]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        return None

    model = (os.getenv("ANTHROPIC_MODEL") or DEFAULT_ANTHROPIC_MODEL).strip()
    system_prompt, user_prompt = _task_breakdown_prompts(text, category)
    payload = {
        "model": model,
        "max_tokens": 1200,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(ANTHROPIC_MESSAGES_URL, headers=headers, json=payload)
            response.raise_for_status()
    except httpx.HTTPError:
        return None

    parsed = _parse_json_object(_extract_anthropic_text(response.json().get("content")))
    if not parsed:
        return None
    return normalize_ai_breakdown(parsed, fallback_text=text, fallback_category=category)


async def build_task_breakdown_with_ai(text: str, category: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
    ordered = ["ranvik", "claude"] if not provider else [provider, *[item for item in ("ranvik", "claude") if item != provider]]

    for item in ordered:
        if item == "ranvik":
            result = await build_task_breakdown_with_ranvik(text, category)
        elif item == "claude":
            result = await build_task_breakdown_with_claude(text, category)
        else:
            result = None
        if result:
            return result, item

    return None, None
