from __future__ import annotations

import os
import json
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult


class TelegramPublisher(Publisher):
    channel = "telegram"

    def _env_config(self, project_code: str) -> Optional[Dict[str, str]]:
        suffix = project_code.upper()
        token = os.getenv(f"SMM_TELEGRAM_BOT_TOKEN_{suffix}", "").strip()
        chat_id = os.getenv(f"SMM_TELEGRAM_CHAT_ID_{suffix}", "").strip()
        return {"token": token, "chat_id": chat_id} if token and chat_id else None

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        resolved = config or self._env_config(project_code)
        return bool(resolved and resolved.get("token") and resolved.get("chat_id"))

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = context.config or self._env_config(context.project_code)
        if config is None:
            raise ValueError(f"Telegram не настроен для проекта «{context.project_code}»")
        endpoint = f"https://api.telegram.org/bot{config['token']}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            slide_bytes = context.asset_bytes_list or []
            if len(slide_bytes) > 1:
                media = []
                files = {}
                for index, payload in enumerate(slide_bytes):
                    key = f"slide{index}"
                    media_item = {"type": "photo", "media": f"attach://{key}"}
                    if index == 0:
                        media_item["caption"] = context.text
                    media.append(media_item)
                    files[key] = (f"{key}.png", payload, "image/png")
                response = await client.post(
                    f"{endpoint}/sendMediaGroup",
                    data={"chat_id": config["chat_id"], "media": json.dumps(media)},
                    files=files,
                )
            elif context.asset_bytes:
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
        if isinstance(message, list):
            message = message[0] if message else {}
        message_id = message.get("message_id")
        external_url = None
        username = (config.get("username") or "").strip().lstrip("@")
        if username and message_id:
            external_url = f"https://t.me/{username}/{message_id}"
        return PublisherResult(str(message_id) if message_id is not None else None, external_url)
