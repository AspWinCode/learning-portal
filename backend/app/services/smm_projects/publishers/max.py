from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult, VerifyResult

# Понятные тексты ошибок MAX API по HTTP-статусу — без них UI показывал
# "подключён" даже когда токен недействителен или бот не имеет доступа к чату.
_STATUS_ERRORS = {
    401: "Недействительный токен MAX",
    403: "Бот не имеет доступа к чату",
    404: "Чат MAX не найден",
    429: "Превышен лимит MAX API",
}


class MaxPublisher(Publisher):
    channel = "max"
    API = "https://platform-api2.max.ru"

    def _env_config(self, project_code: str) -> Optional[Dict[str, str]]:
        suffix = project_code.upper()
        token = os.getenv(f"SMM_MAX_ACCESS_TOKEN_{suffix}", "").strip()
        chat_id = os.getenv(f"SMM_MAX_CHAT_ID_{suffix}", "").strip()
        return {"token": token, "chat_id": chat_id} if token and chat_id else None

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        resolved = config or self._env_config(project_code)
        return bool(resolved and resolved.get("token") and resolved.get("chat_id"))

    def _error_for(self, response: httpx.Response) -> Optional[str]:
        if response.status_code < 400:
            return None
        known = _STATUS_ERRORS.get(response.status_code)
        if known:
            return known
        try:
            body = response.json()
        except ValueError:
            body = None
        if isinstance(body, dict):
            detail = body.get("message") or body.get("error")
            if detail:
                return f"MAX API: {detail}"
        return f"MAX API вернул ошибку {response.status_code}: {(response.text or '').strip()[:300]}"

    async def verify(self, project_code: str, config: Optional[Dict[str, str]] = None) -> VerifyResult:
        resolved = config or self._env_config(project_code)
        if not resolved or not resolved.get("token") or not resolved.get("chat_id"):
            return VerifyResult(ok=False, error="MAX не настроен: отсутствует токен или chat_id")
        headers = {"Authorization": resolved["token"]}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(f"{self.API}/chats/{resolved['chat_id']}", headers=headers)
        except httpx.RequestError as exc:
            return VerifyResult(ok=False, error=f"MAX API недоступен: {exc}")
        error = self._error_for(response)
        if error:
            return VerifyResult(ok=False, error=error)
        try:
            data = response.json()
        except ValueError:
            return VerifyResult(ok=False, error="MAX API вернул некорректный JSON")
        chat_id = str(data.get("chat_id") or resolved["chat_id"])
        chat_title = data.get("title")
        return VerifyResult(ok=True, detail={"chat_id": chat_id, "chat_title": chat_title})

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = context.config or self._env_config(context.project_code)
        if config is None:
            raise ValueError(f"MAX не настроен для проекта «{context.project_code}»")
        headers = {"Authorization": config["token"]}
        async with httpx.AsyncClient(timeout=40.0) as client:
            attachments = []
            if context.asset_bytes:
                upload = await client.post(f"{self.API}/uploads?type=image", headers=headers)
                upload_error = self._error_for(upload)
                if upload_error:
                    raise ValueError(upload_error)
                upload_data = upload.json()
                upload_url = upload_data.get("url")
                if not upload_url:
                    raise ValueError("MAX не вернул URL загрузки изображения")
                uploaded = await client.post(
                    upload_url,
                    headers=headers,
                    files={"data": (context.asset_filename, context.asset_bytes, "image/png")},
                )
                uploaded_error = self._error_for(uploaded)
                if uploaded_error:
                    raise ValueError(uploaded_error)
                uploaded_data = uploaded.json()
                # Реальный ответ MAX: {"photos": {"0": {"token": "..."}}} — ключ
                # под "photos" это числовой индекс фото, а не "photoIds" (так
                # предполагал старый код и из-за этого падал на любой картинке).
                # Подтверждено живым вызовом /uploads?type=image.
                token = None
                photos = uploaded_data.get("photos")
                if isinstance(photos, dict) and photos:
                    first_photo = next(iter(photos.values()))
                    if isinstance(first_photo, dict):
                        token = first_photo.get("token")
                if not token:
                    token = uploaded_data.get("token")
                if not token:
                    raise ValueError("MAX не вернул media token")
                attachments.append({"type": "image", "payload": {"token": token}})
            response = await client.post(
                f"{self.API}/messages",
                params={"chat_id": config["chat_id"]},
                headers=headers,
                json={"text": context.text, "attachments": attachments},
            )
        message_error = self._error_for(response)
        if message_error:
            raise ValueError(message_error)
        try:
            data = response.json()
        except ValueError as exc:
            raise ValueError("MAX API вернул некорректный JSON") from exc
        if data.get("code") or data.get("error"):
            raise ValueError(str(data.get("message") or data.get("error") or data))
        message = data.get("message") or data
        # Реальный ID сообщения лежит в message.body.mid (подтверждено живым
        # ответом MAX API), а не message.message_id/message.id — со старым
        # полем external_id молча оставался пустой строкой при status=success.
        body = message.get("body") if isinstance(message, dict) else None
        message_id = (body or {}).get("mid") or message.get("message_id") or message.get("id") or ""
        return PublisherResult(str(message_id), None)
