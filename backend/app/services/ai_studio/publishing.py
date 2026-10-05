"""Публикация материала в соцсети (п.34/scheduling-publication из ТЗ).

Важно — это НЕ автопубликация по расписанию. publish() вызывается только из
POST /content/{id}/publish, который требует права ai_studio.publish и явного
клика человека в UI. scheduled_date на контенте/пункте плана — это просто
дата, когда человек ПЛАНИРУЕТ опубликовать вручную; ничто в этом модуле не
публикует что-либо само по таймеру/крону.

Каждый канал настраивается через env-переменные на направление (без них —
понятная ошибка "канал не настроен", как и в ai_gateway.is_configured):
  VK:       AI_STUDIO_VK_TOKEN_<CODE>, AI_STUDIO_VK_GROUP_ID_<CODE>
  Telegram: AI_STUDIO_TELEGRAM_BOT_TOKEN_<CODE>, AI_STUDIO_TELEGRAM_CHAT_ID_<CODE>
<CODE> — workspace.code в верхнем регистре (например KODARENA).
"""
from __future__ import annotations

import os
from typing import Dict, Optional

import httpx
from sqlalchemy.orm import Session

from app.models import AiGeneratedContent, AiPublishLog, AiWorkspace

SUPPORTED_CHANNELS = ("vk", "telegram")

VK_API_VERSION = "5.199"


def _env(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def _vk_config(workspace_code: str) -> Optional[Dict[str, str]]:
    suffix = workspace_code.upper()
    token = _env(f"AI_STUDIO_VK_TOKEN_{suffix}")
    group_id = _env(f"AI_STUDIO_VK_GROUP_ID_{suffix}")
    if not token or not group_id:
        return None
    return {"token": token, "group_id": group_id}


def _telegram_config(workspace_code: str) -> Optional[Dict[str, str]]:
    suffix = workspace_code.upper()
    bot_token = _env(f"AI_STUDIO_TELEGRAM_BOT_TOKEN_{suffix}")
    chat_id = _env(f"AI_STUDIO_TELEGRAM_CHAT_ID_{suffix}")
    if not bot_token or not chat_id:
        return None
    return {"bot_token": bot_token, "chat_id": chat_id}


def is_channel_configured(channel: str, workspace_code: str) -> bool:
    if channel == "vk":
        return _vk_config(workspace_code) is not None
    if channel == "telegram":
        return _telegram_config(workspace_code) is not None
    return False


async def _publish_vk(workspace_code: str, text: str) -> Dict[str, Optional[str]]:
    config = _vk_config(workspace_code)
    if config is None:
        raise ValueError(f"VK не настроен для направления «{workspace_code}» (нет токена/group_id)")
    owner_id = f"-{config['group_id']}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.vk.com/method/wall.post",
            data={
                "owner_id": owner_id,
                "message": text,
                "access_token": config["token"],
                "v": VK_API_VERSION,
            },
        )
        data = resp.json()
    if "error" in data:
        raise ValueError(str(data["error"].get("error_msg") or data["error"]))
    post_id = (data.get("response") or {}).get("post_id")
    if post_id is None:
        raise ValueError("VK API не вернул post_id")
    return {"external_id": str(post_id), "external_url": f"https://vk.com/wall{owner_id}_{post_id}"}


async def _publish_telegram(workspace_code: str, text: str) -> Dict[str, Optional[str]]:
    config = _telegram_config(workspace_code)
    if config is None:
        raise ValueError(f"Telegram не настроен для направления «{workspace_code}» (нет bot token/chat_id)")
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
            json={"chat_id": config["chat_id"], "text": text},
        )
        data = resp.json()
    if not data.get("ok"):
        raise ValueError(str(data.get("description") or "Telegram API вернул ошибку"))
    message_id = (data.get("result") or {}).get("message_id")
    return {"external_id": str(message_id) if message_id is not None else None, "external_url": None}


async def publish(
    db: Session,
    user,
    *,
    workspace: AiWorkspace,
    content: AiGeneratedContent,
    channel: str,
) -> AiPublishLog:
    if channel not in SUPPORTED_CHANNELS:
        raise ValueError(f"Канал «{channel}» не поддерживается. Доступны: {', '.join(SUPPORTED_CHANNELS)}")
    if not is_channel_configured(channel, workspace.code):
        raise ValueError(f"Канал «{channel}» не настроен для направления «{workspace.code}»")

    text = (content.output_text or "").strip()
    if not text:
        raise ValueError("У материала нет текста для публикации")

    log = AiPublishLog(
        content_id=content.id,
        workspace_id=workspace.id,
        channel=channel,
        published_by_id=getattr(user, "id", None),
    )
    try:
        result = await (_publish_vk(workspace.code, text) if channel == "vk" else _publish_telegram(workspace.code, text))
        log.status = "success"
        log.external_id = result.get("external_id")
        log.external_url = result.get("external_url")
    except Exception as exc:  # noqa: BLE001 — внешний API, любая ошибка должна попасть в аудит, не в 500
        log.status = "error"
        log.error = str(exc)
    db.add(log)
    db.commit()
    db.refresh(log)
    if log.status == "error":
        raise ValueError(log.error or "Публикация не удалась")
    return log


def list_publish_logs(db: Session, content: AiGeneratedContent):
    return (
        db.query(AiPublishLog)
        .filter(AiPublishLog.content_id == content.id)
        .order_by(AiPublishLog.created_at.desc())
        .all()
    )
