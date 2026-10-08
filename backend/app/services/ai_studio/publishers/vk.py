from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult

VK_API = "https://api.vk.com/method"
VK_API_VERSION = "5.199"


def _env(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


class VkPublisher(Publisher):
    channel = "vk"

    def _config(self, workspace_code: str) -> Optional[Dict[str, str]]:
        suffix = workspace_code.upper()
        token = _env(f"AI_STUDIO_VK_TOKEN_{suffix}")
        group_id = _env(f"AI_STUDIO_VK_GROUP_ID_{suffix}")
        return {"token": token, "group_id": group_id} if token and group_id else None

    def is_configured(self, workspace_code: str) -> bool:
        return self._config(workspace_code) is not None

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = self._config(context.workspace_code)
        if config is None:
            raise ValueError(f"VK не настроен для направления «{context.workspace_code}»")
        owner_id = f"-{config['group_id']}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            attachments = None
            if context.asset_bytes:
                upload = await client.post(
                    f"{VK_API}/photos.getWallUploadServer",
                    params={"group_id": config["group_id"], "access_token": config["token"], "v": VK_API_VERSION},
                )
                upload_data = upload.json()
                if "error" in upload_data:
                    raise ValueError(str(upload_data["error"].get("error_msg") or upload_data["error"]))
                upload_url = (upload_data.get("response") or {}).get("upload_url")
                if not upload_url:
                    raise ValueError("VK не вернул upload_url")
                uploaded = await client.post(
                    upload_url,
                    files={"photo": (context.asset_filename, context.asset_bytes, "image/png")},
                )
                uploaded_data = uploaded.json()
                if "error" in uploaded_data:
                    raise ValueError(str(uploaded_data["error"].get("error_msg") or uploaded_data["error"]))
                saved = await client.post(
                    f"{VK_API}/photos.saveWallPhoto",
                    data={
                        "group_id": config["group_id"],
                        "server": uploaded_data.get("server"),
                        "photo": uploaded_data.get("photo"),
                        "hash": uploaded_data.get("hash"),
                        "access_token": config["token"],
                        "v": VK_API_VERSION,
                    },
                )
                saved_data = saved.json()
                if "error" in saved_data:
                    raise ValueError(str(saved_data["error"].get("error_msg") or saved_data["error"]))
                photo = (saved_data.get("response") or [{}])[0]
                if photo.get("owner_id") and photo.get("id"):
                    attachments = f"photo{photo['owner_id']}_{photo['id']}"

            params = {
                "owner_id": owner_id,
                "message": context.text,
                "access_token": config["token"],
                "v": VK_API_VERSION,
            }
            if attachments:
                params["attachments"] = attachments
            response = await client.post(f"{VK_API}/wall.post", data=params)
            data = response.json()
        if "error" in data:
            raise ValueError(str(data["error"].get("error_msg") or data["error"]))
        post_id = (data.get("response") or {}).get("post_id")
        if post_id is None:
            raise ValueError("VK API не вернул post_id")
        return PublisherResult(str(post_id), f"https://vk.com/wall{owner_id}_{post_id}")
