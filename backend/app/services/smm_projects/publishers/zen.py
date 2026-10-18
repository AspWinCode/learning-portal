from __future__ import annotations

import os
from typing import Dict, Optional

from .base import PublicationContext, Publisher, PublisherResult, VerifyResult


def feed_url(project_code: str) -> str:
    domain = (os.getenv("DOMAIN") or "").strip()
    base = f"https://{domain}" if domain else ""
    return f"{base}/api/v1/smm-projects/public/projects/{project_code}/zen-feed.xml"


class ZenPublisher(Publisher):
    """Дзен не даёт публичного API для публикации постов (ни один легальный
    способ, см. обсуждение с пользователем) — рабочий вариант дистрибуции:
    Дзен сам умеет импортировать статьи по RSS, настраивается один раз в
    Студии Дзена на стороне канала. Поэтому здесь нет ни токена, ни реального
    HTTP-вызова: «публикация» — это появление записи в нашем RSS-фиде
    (zen-feed.xml, см. router), а дальше Дзен сам решает, когда и как её
    забрать по своему расписанию опроса фида."""

    channel = "zen"

    def is_configured(self, project_code: str, config: Optional[Dict[str, str]] = None) -> bool:
        return config is not None

    async def verify(self, project_code: str, config: Optional[Dict[str, str]] = None) -> VerifyResult:
        if config is None:
            return VerifyResult(ok=False, error="Канал не настроен")
        return VerifyResult(ok=True, detail={"feed_url": feed_url(project_code)})

    async def publish(self, context: PublicationContext) -> PublisherResult:
        # Нет внешнего вызова — попадание в RSS-фид и есть «публикация»;
        # что именно и когда Дзен заберёт из фида, от нас не зависит.
        return PublisherResult(external_id=None, external_url=feed_url(context.project_code))
