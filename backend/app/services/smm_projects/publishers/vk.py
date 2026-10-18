from __future__ import annotations

import os
from typing import Dict, Optional

import httpx

from .base import PublicationContext, Publisher, PublisherResult, VerifyResult

VK_API = "https://api.vk.com/method"
VK_API_VERSION = "5.199"

# https://dev.vk.com/ru/reference/errors — коды, которые реально встречаются
# при неверном токене/group_id сообщества.
_VK_ERROR_MESSAGES = {
    5: "Недействительный токен VK",
    15: "Токен не имеет доступа к этому сообществу",
    27: "Это токен пользователя, а не сообщества",
    100: "Сообщество не найдено: неверный ID",
    113: "Сообщество не найдено: неверный ID",
}


def _env(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def _vk_error(data: Dict) -> Optional[str]:
    err = data.get("error")
    if not err:
        return None
    code = err.get("error_code")
    return _VK_ERROR_MESSAGES.get(code) or f"VK API: {err.get('error_msg') or 'неизвестная ошибка'}"


class VkPublisher(Publisher):
    channel = "vk"

    def _env_config(self, project_code: str) -> Optional[Dict[str, str]]:
        suffix = project_code.upper()
        token = _env(f"SMM_VK_TOKEN_{suffix}")
        group_id = _env(f"SMM_VK_GROUP_ID_{suffix}")
        return {"token": token, "group_id": group_id} if token and group_id else None

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        resolved = config or self._env_config(project_code)
        return bool(resolved and resolved.get("token") and resolved.get("group_id"))

    async def verify(self, project_code: str, config: Optional[Dict[str, str]] = None) -> VerifyResult:
        resolved = config or self._env_config(project_code)
        if not resolved or not resolved.get("token") or not resolved.get("group_id"):
            return VerifyResult(ok=False, error="VK не настроен: отсутствует токен или ID сообщества")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                group_resp = await client.get(
                    f"{VK_API}/groups.getById",
                    params={"group_id": resolved["group_id"], "access_token": resolved["token"], "v": VK_API_VERSION},
                )
                group_data = group_resp.json()
                error = _vk_error(group_data)
                if error:
                    return VerifyResult(ok=False, error=error)

                # Группа существует и токен её видит — но публиковать можно,
                # только если у токена реально есть право "wall", а не просто
                # чтение; без этого wall.post упадёт уже в момент публикации.
                perms_resp = await client.get(
                    f"{VK_API}/groups.getTokenPermissions",
                    params={"access_token": resolved["token"], "v": VK_API_VERSION},
                )
                perms_data = perms_resp.json()
        except httpx.RequestError as exc:
            return VerifyResult(ok=False, error=f"VK API недоступен: {exc}")
        except ValueError:
            return VerifyResult(ok=False, error="VK API вернул некорректный JSON")

        error = _vk_error(perms_data)
        if error:
            return VerifyResult(ok=False, error=error)
        permissions = {p.get("name") for p in ((perms_data.get("response") or {}).get("permissions") or [])}
        if "wall" not in permissions:
            return VerifyResult(ok=False, error="У токена нет права «wall» — публикация на стене сообщества запрещена")

        groups = (group_data.get("response") or {})
        group_list = groups.get("groups") if isinstance(groups, dict) else groups
        group = (group_list or [{}])[0]
        name = group.get("name") or f"id{resolved['group_id']}"
        return VerifyResult(ok=True, detail={"chat_id": str(group.get("id") or resolved["group_id"]), "chat_title": name})

    async def publish(self, context: PublicationContext) -> PublisherResult:
        config = context.config or self._env_config(context.project_code)
        if config is None:
            raise ValueError(f"VK не настроен для проекта «{context.project_code}»")
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
