from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class PublicationContext:
    project_code: str
    channel: str
    text: str
    asset_bytes: Optional[bytes] = None
    asset_filename: str = "image.png"
    asset_url: Optional[str] = None
    # Разрешённые секреты из SmmChannelConfig (UI), если owner настроил канал
    # в проекте; если None — публикатор падает на env-переменные (ops-level
    # резервный путь, см. каждый _env_config()).
    config: Optional[Dict[str, str]] = None


@dataclass
class PublisherResult:
    external_id: Optional[str]
    external_url: Optional[str] = None


class Publisher:
    channel: str

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        raise NotImplementedError

    async def publish(self, context: PublicationContext) -> PublisherResult:
        raise NotImplementedError
