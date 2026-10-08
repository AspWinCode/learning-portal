"""Shared approval-aware publication pipeline for all AI Studio workspaces."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import AiGeneratedAsset, AiGeneratedContent, AiPublication, AiPublicationStatus, AiPublishLog, AiWorkspace
from app.services.ai_studio import storage
from app.services.ai_studio.publishers.base import PublicationContext, PublisherResult
from app.services.ai_studio.publishers.instagram import InstagramPublisher
from app.services.ai_studio.publishers.max import MaxPublisher
from app.services.ai_studio.publishers.telegram import TelegramPublisher
from app.services.ai_studio.publishers.vk import VkPublisher

SUPPORTED_CHANNELS = ("vk", "telegram", "instagram", "max")
PUBLISHERS = {"vk": VkPublisher(), "telegram": TelegramPublisher(), "instagram": InstagramPublisher(), "max": MaxPublisher()}


def is_channel_configured(channel: str, workspace_code: str) -> bool:
    publisher = PUBLISHERS.get(channel)
    return bool(publisher and publisher.is_configured(workspace_code))


def _context(workspace: AiWorkspace, publication: AiPublication, asset: Optional[AiGeneratedAsset]) -> PublicationContext:
    return PublicationContext(
        workspace_code=workspace.code, channel=publication.channel, text=publication.text_snapshot,
        asset_bytes=storage.read_bytes(asset.storage_key) if asset and asset.storage_key else None,
        asset_filename=f"ai_studio_{publication.content_id}.png", asset_url=asset.url if asset else None,
    )


async def _deliver(workspace: AiWorkspace, publication: AiPublication, asset: Optional[AiGeneratedAsset]) -> PublisherResult:
    publisher = PUBLISHERS.get(publication.channel)
    if publisher is None:
        raise ValueError(f"Канал «{publication.channel}» не поддерживается")
    if not publisher.is_configured(workspace.code):
        raise ValueError(f"Канал «{publication.channel}» не настроен для направления «{workspace.code}»")
    return await publisher.publish(_context(workspace, publication, asset))


async def publish(db: Session, user, *, workspace: AiWorkspace, content: AiGeneratedContent, channel: str) -> AiPublishLog:
    """Backwards-compatible immediate publishing with server-side approval check."""
    if channel not in SUPPORTED_CHANNELS:
        raise ValueError(f"Канал «{channel}» не поддерживается. Доступны: {', '.join(SUPPORTED_CHANNELS)}")
    if content.status and content.status != "approved":
        raise ValueError("Материал можно публиковать только после одобрения")
    text = (content.output_text or "").strip()
    if not text:
        raise ValueError("У материала нет текста для публикации")
    publication = AiPublication(content_id=content.id, workspace_id=workspace.id, channel=channel, asset_id=getattr(content, "selected_asset_id", None), text_snapshot=text, status=AiPublicationStatus.PUBLISHING.value, approved_by_id=getattr(user, "id", None), approved_at=datetime.now(timezone.utc), idempotency_key=f"legacy:{content.id}:{channel}", attempt_count=1)
    asset = None
    if publication.asset_id:
        asset = db.query(AiGeneratedAsset).filter(AiGeneratedAsset.id == publication.asset_id, AiGeneratedAsset.content_id == content.id).first()
    log = AiPublishLog(content_id=content.id, workspace_id=workspace.id, channel=channel, published_by_id=getattr(user, "id", None))
    try:
        result = await _deliver(workspace, publication, asset)
        log.status, log.external_id, log.external_url = "success", result.external_id, result.external_url
    except Exception as exc:  # noqa: BLE001
        log.status, log.error = "error", str(exc)
    db.add(log)
    db.commit()
    db.refresh(log)
    if log.status == "error":
        raise ValueError(log.error or "Публикация не удалась")
    return log


def create_publications(db: Session, user, *, workspace: AiWorkspace, items: Iterable[Dict[str, Optional[int]]], publish_at: Optional[datetime]) -> list[AiPublication]:
    now = datetime.now(timezone.utc)
    publications = []
    for item in items:
        channel, content_id = str(item.get("channel") or "").lower(), int(item.get("content_id") or 0)
        if channel not in SUPPORTED_CHANNELS:
            raise ValueError(f"Канал «{channel}» не поддерживается")
        content = db.query(AiGeneratedContent).filter(AiGeneratedContent.id == content_id, AiGeneratedContent.workspace_id == workspace.id).first()
        if content is None:
            raise ValueError("Материал не найден в выбранном направлении")
        if content.status != "approved":
            raise ValueError(f"Материал #{content.id} можно публиковать только после одобрения")
        text = (content.output_text or "").strip()
        if not text:
            raise ValueError(f"Материал #{content.id} не содержит текста")
        asset_id = item.get("asset_id") or getattr(content, "selected_asset_id", None)
        if asset_id and not db.query(AiGeneratedAsset).filter(AiGeneratedAsset.id == asset_id, AiGeneratedAsset.content_id == content.id).first():
            raise ValueError("Выбранный visual не принадлежит материалу")
        scheduled = publish_at if publish_at and publish_at > now else None
        state = AiPublicationStatus.SCHEDULED.value if scheduled else AiPublicationStatus.APPROVED.value
        idem = f"publication:{content.id}:{channel}:{scheduled.isoformat() if scheduled else 'now'}"
        existing = db.query(AiPublication).filter(AiPublication.idempotency_key == idem).first()
        if existing:
            publications.append(existing)
            continue
        row = AiPublication(content_id=content.id, workspace_id=workspace.id, channel=channel, asset_id=asset_id, text_snapshot=text, status=state, scheduled_at=scheduled, approved_by_id=getattr(user, "id", None), approved_at=now, idempotency_key=idem)
        db.add(row)
        publications.append(row)
    db.commit()
    for row in publications:
        db.refresh(row)
    return publications


async def process_publication(db: Session, publication_id: int) -> Optional[AiPublication]:
    row = db.query(AiPublication).filter(AiPublication.id == publication_id).first()
    if row is None or row.status in (AiPublicationStatus.SUCCESS.value, AiPublicationStatus.CANCELLED.value):
        return row
    now = datetime.now(timezone.utc)
    if row.status == AiPublicationStatus.SCHEDULED.value and row.scheduled_at and row.scheduled_at > now:
        return row
    claimed = db.query(AiPublication).filter(AiPublication.id == publication_id, AiPublication.status.in_([AiPublicationStatus.APPROVED.value, AiPublicationStatus.SCHEDULED.value])).update({"status": AiPublicationStatus.PUBLISHING.value, "started_at": now, "attempt_count": AiPublication.attempt_count + 1}, synchronize_session=False)
    db.commit()
    if claimed != 1:
        return db.query(AiPublication).filter(AiPublication.id == publication_id).first()
    row = db.query(AiPublication).filter(AiPublication.id == publication_id).first()
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == row.workspace_id).first()
    asset = db.query(AiGeneratedAsset).filter(AiGeneratedAsset.id == row.asset_id, AiGeneratedAsset.content_id == row.content_id).first() if row.asset_id else None
    try:
        result = await _deliver(workspace, row, asset)
        row.status, row.external_id, row.external_url, row.published_at, row.last_error = AiPublicationStatus.SUCCESS.value, result.external_id, result.external_url, datetime.now(timezone.utc), None
        log_status, error = "success", None
    except Exception as exc:  # noqa: BLE001
        row.status, row.last_error = AiPublicationStatus.ERROR.value, str(exc)
        log_status, error = "error", str(exc)
    db.add(AiPublishLog(content_id=row.content_id, workspace_id=row.workspace_id, channel=row.channel, status=log_status, external_id=row.external_id, external_url=row.external_url, error=error, published_by_id=row.approved_by_id))
    db.commit()
    return row


def due_publication_ids(db: Session, limit: int = 100) -> list[int]:
    now = datetime.now(timezone.utc)
    return [row[0] for row in db.query(AiPublication.id).filter(AiPublication.status == AiPublicationStatus.SCHEDULED.value, AiPublication.scheduled_at <= now).order_by(AiPublication.scheduled_at).limit(limit).all()]


def list_publications(db: Session, content_id: int):
    return db.query(AiPublication).filter(AiPublication.content_id == content_id).order_by(AiPublication.created_at.desc()).all()


def list_publish_logs(db: Session, content: AiGeneratedContent):
    return db.query(AiPublishLog).filter(AiPublishLog.content_id == content.id).order_by(AiPublishLog.created_at.desc()).all()
