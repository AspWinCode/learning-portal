from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult


class MaxPublisher(Publisher):
    channel = "max"
    API = "https://platform-api2.max.ru"

    def _config(self, workspace_code: str) -> Optional[Dict[str, str]]:
        suffix = workspace_code.upper()
        token = os.getenv(f"AI_STUDIO_MAX_ACCESS_TOKEN_{suffix}", "").strip()
        chat_id = os.getenv(f"AI_STUDIO_MAX_CHAT_ID_{suffix}", "").strip()
        return {"token": token, "chat_id": chat_id} if token and chat_id else None

    def is_configured(self, workspace_code: str) -> bool:
        return self._config(workspace_code) is not None

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = self._config(context.workspace_code)
        if config is None:
            raise ValueError(f"MAX не настроен для направления «{context.workspace_code}»")
        headers = {"Authorization": config["token"]}
        async with httpx.AsyncClient(timeout=40.0) as client:
            attachments = []
            if context.asset_bytes:
                upload = await client.post(f"{self.API}/uploads?type=image", headers=headers)
                upload_data = upload.json()
                upload_url = upload_data.get("url")
                if not upload_url:
                    raise ValueError("MAX не вернул URL загрузки изображения")
                uploaded = await client.post(
                    upload_url,
                    headers=headers,
                    files={"data": (context.asset_filename, context.asset_bytes, "image/png")},
                )
                uploaded_data = uploaded.json()
                token = ((uploaded_data.get("photos") or {}).get("photoIds") or {}).get("token")
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
            data = response.json()
        if data.get("code") or data.get("error"):
            raise ValueError(str(data.get("message") or data.get("error") or data))
        message = data.get("message") or data
        return PublisherResult(str(message.get("message_id") or message.get("id") or ""), None)
