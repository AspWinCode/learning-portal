from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class PublicationContext:
    workspace_code: str
    channel: str
    text: str
    asset_bytes: Optional[bytes] = None
    asset_filename: str = "image.png"
    asset_url: Optional[str] = None


@dataclass
class PublisherResult:
    external_id: Optional[str]
    external_url: Optional[str] = None


class Publisher:
    channel: str

    def is_configured(self, workspace_code: str) -> bool:
        raise NotImplementedError

    async def publish(self, context: PublicationContext) -> PublisherResult:
        raise NotImplementedError
