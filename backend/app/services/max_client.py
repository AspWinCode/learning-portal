"""Small official MAX Bot API client used by group communication flows."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import requests

logger = logging.getLogger(__name__)


class MaxApiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class MaxUnauthorizedError(MaxApiError):
    pass


class MaxForbiddenError(MaxApiError):
    pass


class MaxNotFoundError(MaxApiError):
    pass


class MaxRateLimitedError(MaxApiError):
    pass


@dataclass(frozen=True)
class MaxChat:
    chat_id: str
    title: str | None
    raw: dict[str, Any]


class MaxClient:
    def __init__(self, base_url: str | None = None, token: str | None = None, timeout: float = 15.0):
        self.base_url = (base_url or os.getenv("MAX_API_BASE_URL") or "https://platform-api2.max.ru").strip().rstrip("/")
        self.token = (token or os.getenv("MAX_BOT_TOKEN") or "").strip()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        enabled = os.getenv("MAX_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
        return enabled and bool(self.base_url and self.token)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.configured:
            raise MaxApiError("MAX Bot API не настроен")
        headers = dict(kwargs.pop("headers", {}) or {})
        headers["Authorization"] = self.token
        headers.setdefault("Accept", "application/json")
        url = f"{self.base_url}/{path.lstrip('/')}"
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = requests.request(method, url, headers=headers, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(0.25 * (2**attempt))
                    continue
                raise MaxApiError("MAX API недоступен") from exc
            retry_after = _retry_after(response.headers.get("Retry-After"))
            if response.status_code == 429:
                raise MaxRateLimitedError("MAX API ограничил частоту запросов", 429, retry_after)
            if response.status_code == 401:
                raise MaxUnauthorizedError("Токен MAX недействителен", 401)
            if response.status_code == 403:
                raise MaxForbiddenError("Бот не имеет доступа к MAX-чату", 403)
            if response.status_code == 404:
                raise MaxNotFoundError("MAX-чат не найден", 404)
            if response.status_code >= 500:
                if attempt < 2:
                    time.sleep(0.25 * (2**attempt))
                    continue
                raise MaxApiError("Временная ошибка MAX API", response.status_code)
            if response.status_code >= 400:
                raise MaxApiError(_error_text(response), response.status_code)
            try:
                data = response.json()
            except ValueError as exc:
                raise MaxApiError("MAX API вернул некорректный JSON", response.status_code) from exc
            return data if isinstance(data, dict) else {}
        raise MaxApiError("MAX API недоступен") from last_error

    def get_chat(self, chat_id: str) -> MaxChat:
        data = self._request("GET", f"/chats/{chat_id}")
        return MaxChat(chat_id=str(data.get("chat_id", chat_id)), title=data.get("title"), raw=data)

    def get_chat_members(self, chat_id: str) -> dict[str, Any]:
        return self._request("GET", f"/chats/{chat_id}/members")

    def verify_chat(self, chat_id: str) -> MaxChat:
        # Membership endpoint checks the bot's actual access before the chat is saved.
        self._request("GET", f"/chats/{chat_id}/members/me")
        return self.get_chat(chat_id)

    def send_message(self, chat_id: str, text: str) -> str | None:
        data = self._request("POST", "/messages", params={"chat_id": chat_id}, json={"text": text})
        message = data.get("message") or {}
        return str(message.get("body", {}).get("mid") or message.get("id")) if isinstance(message, dict) else None


def _retry_after(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def _error_text(response: requests.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict):
            return str(body.get("message") or body.get("error") or f"MAX API: {response.status_code}")[:300]
    except ValueError:
        pass
    return (response.text or f"MAX API: {response.status_code}")[:300]


def get_max_client() -> MaxClient:
    return MaxClient()
