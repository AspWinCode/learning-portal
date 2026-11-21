"""Periodic collection of engagement counters for supported SMM channels."""
from __future__ import annotations

import logging
import os
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


async def collect_due_metrics(db: Session, *, limit: int = 200) -> int:
    """Refresh counters for channels whose publishing APIs expose post stats."""
    now = datetime.now(timezone.utc)
    cutoff = now - METRICS_REFRESH_INTERVAL
    rows = (
        db.query(SmmPublication)
        .filter(
            SmmPublication.channel.in_(("vk", "max", "instagram")),
            SmmPublication.status == SmmPublicationStatus.SUCCESS.value,
            SmmPublication.external_id.isnot(None),
            or_(SmmPublication.metrics_updated_at.is_(None), SmmPublication.metrics_updated_at < cutoff),
        )
        .order_by(SmmPublication.published_at.desc(), SmmPublication.id.desc())
        .limit(limit)
        .all()
    )
    grouped: dict[tuple[int, str], list[SmmPublication]] = {}
    for row in rows:
        grouped.setdefault((row.project_id, row.channel), []).append(row)

    updated = 0
    async with httpx.AsyncClient(timeout=20.0) as client:
        for (project_id, channel), publications in grouped.items():
            project = db.query(SmmProject).filter(SmmProject.id == project_id).first()
            config = channels.get_channel_config(db, project, channel) if project else None
            if not config or not config.get("token"):
                continue
            if channel == "max":
                updated += await _collect_max_metrics(client, project_id, publications, config, now)
                continue
            if channel == "instagram":
                updated += await _collect_instagram_metrics(client, project_id, publications, config, now)
                continue
            if not config.get("group_id"):
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


async def _collect_max_metrics(client, project_id, publications, config, now) -> int:
    """MAX exposes view counts for channel posts, but not interaction counts."""
    updated = 0
    for offset in range(0, len(publications), 100):
        batch = publications[offset:offset + 100]
        try:
            response = await client.get(
                "https://platform-api2.max.ru/messages",
                params={"message_ids": ",".join(str(row.external_id) for row in batch)},
                headers={"Authorization": config["token"]},
            )
            response.raise_for_status()
            payload = response.json()
            messages = payload.get("messages", []) if isinstance(payload, dict) else []
            by_id = {
                str((item.get("body") or {}).get("mid")): item
                for item in messages if isinstance(item, dict)
            }
            for row in batch:
                message = by_id.get(str(row.external_id))
                stat = message.get("stat") if isinstance(message, dict) else None
                views = _count(stat, "views") if isinstance(stat, dict) else None
                if views is None:
                    continue
                row.metrics_json = {"views": views}
                row.metrics_updated_at = now
                updated += 1
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("SMM MAX metrics request failed for project %s: %s", project_id, exc)
    return updated


async def _collect_instagram_metrics(client, project_id, publications, config, now) -> int:
    """Read available lifetime insights for media published by this account."""
    graph_version = os.getenv("SMM_META_GRAPH_VERSION", "v23.0").strip()
    updated = 0
    for row in publications:
        try:
            response = await client.get(
                f"https://graph.facebook.com/{graph_version}/{row.external_id}/insights",
                params={
                    "metric": "comments,likes,reach,reposts,saved,shares,total_interactions,views",
                    "access_token": config["token"],
                },
            )
            response.raise_for_status()
            payload = response.json()
            values = {}
            for item in payload.get("data", []) if isinstance(payload, dict) else []:
                if not isinstance(item, dict):
                    continue
                name = item.get("name")
                points = item.get("values")
                value = points[0].get("value") if isinstance(points, list) and points and isinstance(points[0], dict) else None
                if isinstance(name, str) and isinstance(value, (int, float)):
                    values[name] = max(0, int(value))
            # Persist only counters actually returned by Meta. An empty data set
            # is a valid response (e.g. a metric is unavailable), not a zero.
            row.metrics_json = values or None
            row.metrics_updated_at = now
            updated += 1
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("SMM Instagram metrics fetch failed for project %s: %s", project_id, exc)
    return updated


# Keep the old import path for deployments or scripts that still reference it.
collect_due_vk_metrics = collect_due_metrics
