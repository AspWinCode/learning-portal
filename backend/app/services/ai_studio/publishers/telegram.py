from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult


class TelegramPublisher(Publisher):
    channel = "telegram"

    def _config(self, workspace_code: str) -> Optional[Dict[str, str]]:
        suffix = workspace_code.upper()
        token = os.getenv(f"AI_STUDIO_TELEGRAM_BOT_TOKEN_{suffix}", "").strip()
        chat_id = os.getenv(f"AI_STUDIO_TELEGRAM_CHAT_ID_{suffix}", "").strip()
        return {"token": token, "chat_id": chat_id} if token and chat_id else None

    def is_configured(self, workspace_code: str) -> bool:
        return self._config(workspace_code) is not None

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = self._config(context.workspace_code)
        if config is None:
            raise ValueError(f"Telegram не настроен для направления «{context.workspace_code}»")
        endpoint = f"https://api.telegram.org/bot{config['token']}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            if context.asset_bytes:
                response = await client.post(
                    f"{endpoint}/sendPhoto",
                    data={"chat_id": config["chat_id"], "caption": context.text},
                    files={"photo": (context.asset_filename, context.asset_bytes, "image/png")},
                )
            else:
                response = await client.post(
                    f"{endpoint}/sendMessage", json={"chat_id": config["chat_id"], "text": context.text}
                )
            data = response.json()
        if not data.get("ok"):
            raise ValueError(str(data.get("description") or "Telegram API вернул ошибку"))
        message = data.get("result") or {}
        message_id = message.get("message_id")
        external_url = None
        username = os.getenv(f"AI_STUDIO_TELEGRAM_USERNAME_{context.workspace_code.upper()}", "").strip().lstrip("@")
        if username and message_id:
            external_url = f"https://t.me/{username}/{message_id}"
        return PublisherResult(str(message_id) if message_id is not None else None, external_url)
