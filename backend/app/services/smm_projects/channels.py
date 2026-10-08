"""Настройка каналов публикации проекта через UI (а не только env-переменные
на сервере) — это и есть «выбираем куда постить» из постановки задачи.

Секреты (токены) хранятся зашифрованными тем же Fernet-ключом, что и
Passwords vault (app.services.password_vault_crypto) — реиспользуем готовую
инфраструктуру шифрования, а не изобретаем свою. Открытым текстом секреты
никогда не возвращаются из API — только статус "configured: true/false"."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import SmmChannelConfig, SmmProject
from app.services.password_vault_crypto import decrypt_password, encrypt_password
from app.services.smm_projects.publishers.instagram import InstagramPublisher
from app.services.smm_projects.publishers.max import MaxPublisher
from app.services.smm_projects.publishers.telegram import TelegramPublisher
from app.services.smm_projects.publishers.vk import VkPublisher

SUPPORTED_CHANNELS = ("vk", "telegram", "instagram", "max")
PUBLISHERS = {"vk": VkPublisher(), "telegram": TelegramPublisher(), "instagram": InstagramPublisher(), "max": MaxPublisher()}

REQUIRED_FIELDS: Dict[str, List[str]] = {
    "vk": ["token", "group_id"],
    "telegram": ["token", "chat_id"],
    "instagram": ["token", "account_id"],
    "max": ["token", "chat_id"],
}


def _row(db: Session, project: SmmProject, channel: str) -> Optional[SmmChannelConfig]:
    return (
        db.query(SmmChannelConfig)
        .filter(SmmChannelConfig.project_id == project.id, SmmChannelConfig.channel == channel)
        .first()
    )


def get_channel_config(db: Session, project: SmmProject, channel: str) -> Optional[Dict[str, Any]]:
    row = _row(db, project, channel)
    if row is None or not row.is_enabled or not row.secret_encrypted:
        return None
    return json.loads(decrypt_password(row.secret_encrypted))


def set_channel_config(db: Session, project: SmmProject, user, channel: str, config: Dict[str, Any]) -> SmmChannelConfig:
    if channel not in SUPPORTED_CHANNELS:
        raise ValueError(f"Канал «{channel}» не поддерживается. Доступны: {', '.join(SUPPORTED_CHANNELS)}")
    missing = [f for f in REQUIRED_FIELDS[channel] if not str(config.get(f) or "").strip()]
    if missing:
        raise ValueError(f"Не заполнены обязательные поля канала: {', '.join(missing)}")

    row = _row(db, project, channel)
    if row is None:
        row = SmmChannelConfig(project_id=project.id, channel=channel, created_by_id=getattr(user, "id", None))
        db.add(row)
    row.secret_encrypted = encrypt_password(json.dumps(config))
    row.is_enabled = True
    db.commit()
    db.refresh(row)
    return row


def disable_channel(db: Session, project: SmmProject, channel: str) -> None:
    row = _row(db, project, channel)
    if row is not None:
        row.is_enabled = False
        db.commit()


def is_configured(db: Session, project: SmmProject, channel: str) -> bool:
    publisher = PUBLISHERS.get(channel)
    if publisher is None:
        return False
    config = get_channel_config(db, project, channel)
    return publisher.is_configured(project.code, config)


def list_channel_statuses(db: Session, project: SmmProject) -> List[Dict[str, Any]]:
    return [{"channel": ch, "configured": is_configured(db, project, ch)} for ch in SUPPORTED_CHANNELS]
