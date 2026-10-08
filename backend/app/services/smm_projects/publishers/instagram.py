from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult


class InstagramPublisher(Publisher):
    """Official Meta Content Publishing adapter for single-image feed posts."""

    channel = "instagram"

    def _env_config(self, project_code: str) -> Optional[Dict[str, str]]:
        suffix = project_code.upper()
        token = os.getenv(f"SMM_INSTAGRAM_ACCESS_TOKEN_{suffix}", "").strip()
        account_id = os.getenv(f"SMM_INSTAGRAM_ACCOUNT_ID_{suffix}", "").strip()
        return {"token": token, "account_id": account_id} if token and account_id else None

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        resolved = config or self._env_config(project_code)
        return bool(resolved and resolved.get("token") and resolved.get("account_id"))

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = context.config or self._env_config(context.project_code)
        if config is None:
            raise ValueError("Instagram не настроен / публикация недоступна")
        if not context.asset_url:
            raise ValueError("Instagram требует публичный URL изображения")
        graph_version = os.getenv("SMM_META_GRAPH_VERSION", "v23.0").strip()
        base = f"https://graph.facebook.com/{graph_version}/{config['account_id']}"
        async with httpx.AsyncClient(timeout=40.0) as client:
            container = await client.post(
                f"{base}/media",
                data={"image_url": context.asset_url, "caption": context.text, "access_token": config["token"]},
            )
            container_data = container.json()
            if container_data.get("error"):
                raise ValueError(str(container_data["error"].get("message") or container_data["error"]))
            creation_id = container_data.get("id")
            if not creation_id:
                raise ValueError("Meta API не вернул media container")
            publish = await client.post(
                f"{base}/media_publish",
                data={"creation_id": creation_id, "access_token": config["token"]},
            )
            publish_data = publish.json()
        if publish_data.get("error"):
            raise ValueError(str(publish_data["error"].get("message") or publish_data["error"]))
        media_id = publish_data.get("id")
        return PublisherResult(str(media_id) if media_id else None, None)
