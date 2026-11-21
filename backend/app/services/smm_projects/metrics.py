"""Periodic collection of engagement counters for supported SMM channels."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import SmmProject, SmmPublication, SmmPublicationStatus
from app.services.smm_projects import channels
from app.services.smm_projects.publishers.vk import VK_API, VK_API_VERSION, _vk_error

logger = logging.getLogger(__name__)
METRICS_REFRESH_INTERVAL = timedelta(hours=24)


def _count(post: dict, key: str) -> int | None:
    value = post.get(key)
    if isinstance(value, dict):
        value = value.get("count")
    try:
        return max(0, int(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


async def collect_due_vk_metrics(db: Session, *, limit: int = 200) -> int:
    """Refresh recent VK post counters once a day; unsupported channels stay null."""
    now = datetime.now(timezone.utc)
    cutoff = now - METRICS_REFRESH_INTERVAL
    rows = (
        db.query(SmmPublication)
        .filter(
            SmmPublication.channel == "vk",
            SmmPublication.status == SmmPublicationStatus.SUCCESS.value,
            SmmPublication.external_id.isnot(None),
            or_(SmmPublication.metrics_updated_at.is_(None), SmmPublication.metrics_updated_at < cutoff),
        )
        .order_by(SmmPublication.published_at.desc(), SmmPublication.id.desc())
        .limit(limit)
        .all()
    )
    grouped: dict[int, list[SmmPublication]] = {}
    for row in rows:
        grouped.setdefault(row.project_id, []).append(row)

    updated = 0
    async with httpx.AsyncClient(timeout=20.0) as client:
        for project_id, publications in grouped.items():
            project = db.query(SmmProject).filter(SmmProject.id == project_id).first()
            config = channels.get_channel_config(db, project, "vk") if project else None
            if not config or not config.get("token") or not config.get("group_id"):
                continue
            owner_id = -abs(int(config["group_id"]))
            for offset in range(0, len(publications), 100):
                batch = publications[offset:offset + 100]
                posts = ",".join(f"{owner_id}_{row.external_id}" for row in batch)
                try:
                    response = await client.get(
                        f"{VK_API}/wall.getById",
                        params={"posts": posts, "access_token": config["token"], "v": VK_API_VERSION},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    error = _vk_error(payload)
                    if error:
                        logger.warning("SMM VK metrics fetch failed for project %s: %s", project_id, error)
                        continue
                    post_by_id = {str(item.get("id")): item for item in (payload.get("response") or [])}
                    for row in batch:
                        post = post_by_id.get(str(row.external_id))
                        if post is None:
                            continue
                        metrics = {
                            "views": _count(post, "views"),
                            "likes": _count(post, "likes"),
                            "comments": _count(post, "comments"),
                            "reposts": _count(post, "reposts"),
                        }
                        row.metrics_json = {key: value for key, value in metrics.items() if value is not None}
                        row.metrics_updated_at = now
                        updated += 1
                except (httpx.HTTPError, ValueError, TypeError) as exc:
                    logger.warning("SMM VK metrics request failed for project %s: %s", project_id, exc)
    if updated:
        db.commit()
        logger.info("SMM metrics refreshed for %d publication(s)", updated)
    return updated
