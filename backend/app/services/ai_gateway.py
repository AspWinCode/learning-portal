"""AI Tunnel — единый шлюз доступа ко всем ИИ-моделям сервиса.

Ядро оркестрации (модуль academy_ai и др.) обращается не к каждой модели
напрямую, а через этот шлюз. Это даёт:
  - единый механизм авторизации и учёта расхода токенов (таблица
    ai_gateway_call_logs);
  - возможность подменить/добавить модель без переделки остальной системы —
    достаточно поменять env-переменные AI_TUNNEL_*;
  - централизованное логирование запросов (аудит и отладка).

Провайдеры:
  - ``tunnel``  — OpenAI-совместимый шлюз «AI Tunnel» (много моделей за одним
    base_url). Env: AI_TUNNEL_BASE_URL, AI_TUNNEL_API_KEY, AI_TUNNEL_MODEL_*.
  - ``ranvik``  — OpenAI-совместимый прокси (уже используется в проекте).
  - ``claude``  — прямой Anthropic Messages API (fallback).

Порядок перебора: значение AI_PROVIDER (если задано) первым, затем остальные.
Все сетевые ошибки проглатываются — вызывающий код получает результат с
``ok = False`` и сам решает, что делать (fallback на правила и т.п.).
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

from app.database import SessionLocal

ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

DEFAULT_RANVIK_BASE_URL = "https://api.ranvik.ru/v1"
DEFAULT_RANVIK_MODEL = "claude-haiku-4-5"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"

_ALL_PROVIDERS = ("tunnel", "ranvik", "claude")

Purpose = str  # "text" | "vision" | "image" | "embed"


@dataclass
class GatewayResult:
    ok: bool = False
    text: str = ""
    provider: Optional[str] = None
    model: Optional[str] = None
    purpose: Purpose = "text"
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    error: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)
    data: Any = None  # эмбеддинги / ссылки на картинки / произвольная полезная нагрузка

    def json_object(self) -> Optional[Dict[str, Any]]:
        return _parse_json_object(self.text) if self.text else None


# ─── Конфиг провайдеров ─────────────────────────────────────────────────────

def _provider_order(explicit: Optional[str] = None) -> List[str]:
    chosen = (explicit or os.getenv("AI_PROVIDER") or "").strip().lower()
    if chosen in _ALL_PROVIDERS:
        return [chosen, *[p for p in _ALL_PROVIDERS if p != chosen]]
    return list(_ALL_PROVIDERS)


def _openai_config(provider: str, purpose: Purpose) -> Optional[Dict[str, str]]:
    """base_url + api_key + model для OpenAI-совместимого провайдера, либо None,
    если он не сконфигурирован."""
    if provider == "tunnel":
        api_key = (os.getenv("AI_TUNNEL_API_KEY") or "").strip()
        if not api_key:
            return None
        base_url = (os.getenv("AI_TUNNEL_BASE_URL") or "").strip().rstrip("/")
        if not base_url:
            return None
        model_env = {
            "text": "AI_TUNNEL_MODEL_TEXT",
            "vision": "AI_TUNNEL_MODEL_VISION",
            "image": "AI_TUNNEL_MODEL_IMAGE",
            "embed": "AI_TUNNEL_MODEL_EMBED",
        }[purpose]
        model = (os.getenv(model_env) or os.getenv("AI_TUNNEL_MODEL_TEXT") or "").strip()
        if not model:
            return None
        return {"base_url": base_url, "api_key": api_key, "model": model}

    if provider == "ranvik":
        api_key = (os.getenv("RANVIK_API_KEY") or "").strip()
        if not api_key or purpose not in ("text", "vision"):
            return None
        base_url = (os.getenv("RANVIK_BASE_URL") or DEFAULT_RANVIK_BASE_URL).strip().rstrip("/")
        model = (os.getenv("RANVIK_MODEL") or DEFAULT_RANVIK_MODEL).strip()
        return {"base_url": base_url, "api_key": api_key, "model": model}

    return None


def _anthropic_config() -> Optional[Dict[str, str]]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        return None
    model = (os.getenv("ANTHROPIC_MODEL") or DEFAULT_ANTHROPIC_MODEL).strip()
    return {"api_key": api_key, "model": model}


def is_configured(purpose: Purpose = "text") -> bool:
    for provider in _ALL_PROVIDERS:
        if provider == "claude":
            if purpose == "text" and _anthropic_config():
                return True
        elif _openai_config(provider, purpose):
            return True
    return False


# ─── Извлечение текста/усэйджа из ответов ───────────────────────────────────

def _extract_openai_text(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"].strip()
    return first.get("text", "").strip() if isinstance(first.get("text"), str) else ""


def _extract_anthropic_text(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    parts = [
        item["text"]
        for item in content
        if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str)
    ]
    return "\n".join(parts).strip()


def _openai_usage(payload: Dict[str, Any]) -> Dict[str, Optional[int]]:
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return {
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }


def _anthropic_usage(payload: Dict[str, Any]) -> Dict[str, Optional[int]]:
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    prompt = usage.get("input_tokens")
    completion = usage.get("output_tokens")
    total = (prompt or 0) + (completion or 0) if (prompt is not None or completion is not None) else None
    return {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": total}


def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            value = json.loads(raw[start : end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None


# ─── Учёт вызовов ──────────────────────────────────────────────────────────

def _log_call(
    *,
    feature: str,
    result: GatewayResult,
    user_id: Optional[int],
    duration_ms: Optional[int] = None,
) -> None:
    """Best-effort запись в ai_gateway_call_logs в собственной сессии — не
    затрагивает транзакцию вызывающего кода и никогда не бросает исключение."""
    try:
        from app.models import AiGatewayCallLog

        db = SessionLocal()
        try:
            db.add(
                AiGatewayCallLog(
                    feature=feature,
                    provider=result.provider,
                    model=result.model,
                    purpose=result.purpose,
                    prompt_tokens=result.prompt_tokens,
                    completion_tokens=result.completion_tokens,
                    total_tokens=result.total_tokens,
                    status="ok" if result.ok else "error",
                    error=(result.error or None) if not result.ok else None,
                    user_id=user_id,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — логирование не должно ронять запрос
        pass


# ─── Низкоуровневые вызовы ─────────────────────────────────────────────────

async def _call_openai_chat(
    cfg: Dict[str, str],
    *,
    system: Optional[str],
    messages: List[Dict[str, Any]],
    max_tokens: int,
    temperature: float,
    json_mode: bool,
    timeout: float,
) -> GatewayResult:
    payload_messages: List[Dict[str, Any]] = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    payload_messages.extend(messages)
    payload: Dict[str, Any] = {
        "model": cfg["model"],
        "messages": payload_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{cfg['base_url']}/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
    body = response.json()
    usage = _openai_usage(body)
    return GatewayResult(
        ok=True,
        text=_extract_openai_text(body),
        model=cfg["model"],
        raw=body,
        **usage,
    )


async def _call_anthropic(
    cfg: Dict[str, str],
    *,
    system: Optional[str],
    messages: List[Dict[str, Any]],
    max_tokens: int,
    timeout: float,
) -> GatewayResult:
    payload: Dict[str, Any] = {"model": cfg["model"], "max_tokens": max_tokens, "messages": messages}
    if system:
        payload["system"] = system
    headers = {
        "x-api-key": cfg["api_key"],
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(ANTHROPIC_MESSAGES_URL, headers=headers, json=payload)
        response.raise_for_status()
    body = response.json()
    usage = _anthropic_usage(body)
    return GatewayResult(
        ok=True,
        text=_extract_anthropic_text(body.get("content")),
        model=cfg["model"],
        raw=body,
        **usage,
    )


# ─── Публичное API ────────────────────────────────────────────────────────

async def complete_text(
    *,
    feature: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 1200,
    temperature: float = 0.2,
    json_mode: bool = False,
    provider: Optional[str] = None,
    user_id: Optional[int] = None,
    timeout: float = 30.0,
) -> GatewayResult:
    """Текстовая генерация/консультация. Перебирает провайдеров по порядку,
    возвращает первый успешный результат; при полном отказе — ok=False."""
    last_error: Optional[str] = None
    for name in _provider_order(provider):
        started = time.monotonic()
        try:
            if name == "claude":
                cfg = _anthropic_config()
                if not cfg:
                    continue
                result = await _call_anthropic(
                    cfg,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
            else:
                cfg = _openai_config(name, "text")
                if not cfg:
                    continue
                result = await _call_openai_chat(
                    cfg,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    json_mode=json_mode,
                    timeout=timeout,
                )
            result.provider = name
            result.purpose = "text"
            _log_call(
                feature=feature,
                result=result,
                user_id=user_id,
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            if result.ok and result.text:
                return result
        except httpx.HTTPError as exc:
            last_error = f"{name}: {exc}"
            _log_call(
                feature=feature,
                result=GatewayResult(ok=False, provider=name, purpose="text", error=last_error),
                user_id=user_id,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = f"{name}: {exc}"

    return GatewayResult(ok=False, purpose="text", error=last_error or "no provider configured")


async def analyze_image(
    *,
    feature: str,
    image_url: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 800,
    user_id: Optional[int] = None,
    timeout: float = 45.0,
) -> GatewayResult:
    """Описание/анализ изображения (авто-описание медиа в базе знаний).
    Работает через OpenAI-совместимый multimodal chat (tunnel/ranvik)."""
    last_error: Optional[str] = None
    for name in _provider_order():
        cfg = _openai_config(name, "vision")
        if not cfg:
            continue
        content = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]
        started = time.monotonic()
        try:
            result = await _call_openai_chat(
                cfg,
                system=system,
                messages=[{"role": "user", "content": content}],
                max_tokens=max_tokens,
                temperature=0.2,
                json_mode=False,
                timeout=timeout,
            )
            result.provider = name
            result.purpose = "vision"
            _log_call(
                feature=feature,
                result=result,
                user_id=user_id,
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            if result.ok and result.text:
                return result
        except Exception as exc:  # noqa: BLE001
            last_error = f"{name}: {exc}"
    return GatewayResult(ok=False, purpose="vision", error=last_error or "no vision provider configured")


async def embed(
    *,
    feature: str,
    inputs: List[str],
    user_id: Optional[int] = None,
    timeout: float = 30.0,
) -> GatewayResult:
    """Эмбеддинги для смыслового поиска. Возвращает GatewayResult с data =
    список векторов (list[list[float]])."""
    for name in _provider_order():
        cfg = _openai_config(name, "embed")
        if not cfg:
            continue
        headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
        payload = {"model": cfg["model"], "input": inputs}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(f"{cfg['base_url']}/embeddings", headers=headers, json=payload)
                response.raise_for_status()
            body = response.json()
            vectors = [row.get("embedding") for row in body.get("data", []) if isinstance(row, dict)]
            usage = _openai_usage(body)
            result = GatewayResult(
                ok=bool(vectors),
                provider=name,
                model=cfg["model"],
                purpose="embed",
                data=vectors,
                raw=body,
                prompt_tokens=usage["prompt_tokens"],
                total_tokens=usage["total_tokens"],
            )
            _log_call(feature=feature, result=result, user_id=user_id)
            if result.ok:
                return result
        except Exception as exc:  # noqa: BLE001
            _log_call(
                feature=feature,
                result=GatewayResult(ok=False, provider=name, purpose="embed", error=str(exc)),
                user_id=user_id,
            )
    return GatewayResult(ok=False, purpose="embed", error="no embed provider configured")


async def generate_image(
    *,
    feature: str,
    prompt: str,
    size: str = "1024x1024",
    user_id: Optional[int] = None,
    timeout: float = 90.0,
) -> GatewayResult:
    """Генерация изображения. data = список {url|b64_json} из ответа провайдера."""
    for name in _provider_order():
        cfg = _openai_config(name, "image")
        if not cfg:
            continue
        headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
        payload = {"model": cfg["model"], "prompt": prompt, "size": size, "n": 1}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(f"{cfg['base_url']}/images/generations", headers=headers, json=payload)
                response.raise_for_status()
            body = response.json()
            items = body.get("data", []) if isinstance(body.get("data"), list) else []
            result = GatewayResult(
                ok=bool(items),
                provider=name,
                model=cfg["model"],
                purpose="image",
                data=items,
                raw=body,
            )
            _log_call(feature=feature, result=result, user_id=user_id)
            if result.ok:
                return result
        except Exception as exc:  # noqa: BLE001
            _log_call(
                feature=feature,
                result=GatewayResult(ok=False, provider=name, purpose="image", error=str(exc)),
                user_id=user_id,
            )
    return GatewayResult(ok=False, purpose="image", error="no image provider configured")
