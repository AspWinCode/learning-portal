"""Shared approval-aware publication pipeline for SMM Projects.

publish()/create_publications() требуют content.status == "approved" — явное
решение человека, что материал готов к публикации. Для одиночной публикации
это и есть то самое «явное действие», которое включает автоматизацию:
create_publications с scheduled_at в будущем создаёт SmmPublication(status=
scheduled), который дальше публикует периодическая задача без дополнительного
клика (см. app.background_jobs.run_smm_due_publications) — ровно то
поведение, которое просил пользователь («настроили план — дальше система
работает сама»)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models import SmmContent, SmmContentAsset, SmmProject, SmmPublication, SmmPublicationStatus, SmmPublishLog
from app.services.smm_projects import channels as channels_svc
from app.services.smm_projects.generation import humanize_structured_output, prepare_publication_text
from app.services.smm_projects import storage
from app.services.smm_projects.publishers.base import PublicationContext, PublisherResult

SUPPORTED_CHANNELS = channels_svc.SUPPORTED_CHANNELS
PUBLISHERS = channels_svc.PUBLISHERS
# VK is intentionally text-only in this pipeline: community tokens cannot
# reliably upload wall photos. Other channels should retain the selected image
# all the way through scheduling and delivery.
CHANNELS_WITHOUT_ASSETS = {"vk"}

logger = logging.getLogger(__name__)


def _asset_target_channel(asset: SmmContentAsset) -> Optional[str]:
    meta = asset.meta if isinstance(asset.meta, dict) else {}
    visual_format = meta.get("visual_format") if isinstance(meta.get("visual_format"), dict) else {}
    return visual_format.get("target_channel")


def _assets_for_channel(db: Session, content_id: int, channel: str) -> List[SmmContentAsset]:
    assets = (
        db.query(SmmContentAsset).filter(SmmContentAsset.content_id == content_id)
        .order_by(SmmContentAsset.created_at, SmmContentAsset.id).all()
    )
    targeted = [asset for asset in assets if _asset_target_channel(asset) == channel]
    if targeted:
        return targeted
    generic = [asset for asset in assets if _asset_target_channel(asset) is None]
    if generic:
        return generic
    if any(_asset_target_channel(asset) for asset in assets):
        return []
    return assets


def _asset_id_for_channel(db: Session, content: SmmContent, channel: str) -> Optional[int]:
    if channel in CHANNELS_WITHOUT_ASSETS:
        return None
    assets = _assets_for_channel(db, content.id, channel)
    if assets:
        # A carousel uses all matching assets; the first one anchors its publication.
        return assets[0].id if _is_carousel(content) else assets[-1].id
    if content.selected_asset_id:
        selected = db.query(SmmContentAsset).filter(
            SmmContentAsset.id == content.selected_asset_id,
            SmmContentAsset.content_id == content.id,
        ).first()
        if selected and _asset_target_channel(selected) is None:
            return selected.id
    return None


def is_channel_configured(db: Session, project: SmmProject, channel: str) -> bool:
    return channels_svc.is_configured(db, project, channel)


def _context(db: Session, project: SmmProject, publication: SmmPublication, asset: Optional[SmmContentAsset]) -> PublicationContext:
    all_assets = []
    if asset:
        all_assets = db.query(SmmContentAsset).filter(SmmContentAsset.content_id == publication.content_id).order_by(SmmContentAsset.created_at, SmmContentAsset.id).all()
        content = db.query(SmmContent).filter(SmmContent.id == publication.content_id).first()
        content_format = str((content.input_json or {}).get("content_format") or "").lower() if content else ""
        slides_total = (asset.meta or {}).get("slides_total") if isinstance(asset.meta, dict) else None
        if "карусел" in content_format or "carousel" in content_format:
            # Isolate per-channel slide sets; legacy generic carousels remain valid.
            all_assets = _assets_for_channel(db, publication.content_id, publication.channel)
        elif slides_total and int(slides_total) > 1:
            all_assets = [candidate for candidate in all_assets if isinstance(candidate.meta, dict) and candidate.meta.get("slides_total") == slides_total and _asset_target_channel(candidate) == _asset_target_channel(asset)]
        else:
            all_assets = [asset]
    bytes_list = []
    for candidate in all_assets:
        if candidate.storage_key:
            payload = storage.read_bytes(candidate.storage_key)
            if payload:
                bytes_list.append(payload)
    url_list = [candidate.url for candidate in all_assets if candidate.url]
    return PublicationContext(
        project_code=project.code,
        channel=publication.channel,
        text=publication.text_snapshot,
        asset_bytes=storage.read_bytes(asset.storage_key) if asset and asset.storage_key else None,
        asset_filename=f"smm_{publication.content_id}.png",
        asset_url=asset.url if asset else None,
        asset_bytes_list=bytes_list or None,
        asset_urls=url_list or None,
        config=channels_svc.get_channel_config(db, project, publication.channel),
    )


def _publication_text(content: SmmContent, channel: Optional[str] = None) -> str:
    """Return readable post text, including for legacy JSON drafts."""
    content_format = str((content.input_json or {}).get("content_format") or "").lower()
    if any(marker in content_format for marker in ("карусел", "carousel", "инфограф", "infographic")):
        # Carousels and infographics are image-only publications. The generated
        # copy is used to create the image, but must not become a long caption.
        return ""
    raw = (content.output_text or "").strip()
    if isinstance(content.output_json, dict):
        readable = humanize_structured_output(content.output_json, fallback=raw)
        if readable and readable != raw:
            raw = readable
    return prepare_publication_text(raw, channel=channel)


def _is_carousel(content: SmmContent) -> bool:
    content_format = str((content.input_json or {}).get("content_format") or "").lower()
    return "карусел" in content_format or "carousel" in content_format


def _ensure_carousel_assets(db: Session, content: SmmContent, channel: Optional[str] = None) -> None:
    if not _is_carousel(content):
        return
    count = len(_assets_for_channel(db, content.id, channel)) if channel else db.query(SmmContentAsset).filter(SmmContentAsset.content_id == content.id).count()
    if count < 5:
        raise ValueError(f"Для карусели нужно минимум 5 изображений (сейчас {count})")


async def _deliver(db: Session, project: SmmProject, publication: SmmPublication, asset: Optional[SmmContentAsset]) -> PublisherResult:
    publisher = PUBLISHERS.get(publication.channel)
    if publisher is None:
        raise ValueError(f"Канал «{publication.channel}» не поддерживается")
    context = _context(db, project, publication, asset)
    if not publisher.is_configured(project.code, context.config):
        raise ValueError(f"Канал «{publication.channel}» не настроен для проекта «{project.code}»")
    return await publisher.publish(context)


async def publish(db: Session, user, *, project: SmmProject, content: SmmContent, channel: str) -> SmmPublishLog:
    """Немедленная ручная публикация (кнопка «Опубликовать сейчас»)."""
    if channel not in SUPPORTED_CHANNELS:
        raise ValueError(f"Канал «{channel}» не поддерживается. Доступны: {', '.join(SUPPORTED_CHANNELS)}")
    if content.status != "approved":
        raise ValueError("Материал можно публиковать только после одобрения")
    _ensure_carousel_assets(db, content, channel)
    asset_id = _asset_id_for_channel(db, content, channel)
    text = _publication_text(content, channel=channel)
    if not text and not asset_id:
        raise ValueError("У материала нет текста или изображения для публикации")

    now = datetime.now(timezone.utc)
    publication = SmmPublication(
        content_id=content.id, project_id=project.id, channel=channel,
        asset_id=asset_id, text_snapshot=text,
        status=SmmPublicationStatus.PUBLISHING.value, approved_by_id=getattr(user, "id", None), approved_at=now,
        idempotency_key=f"manual:{content.id}:{channel}:{now.isoformat()}", attempt_count=1,
    )
    db.add(publication)
    db.commit()
    db.refresh(publication)

    asset = None
    if publication.asset_id:
        asset = db.query(SmmContentAsset).filter(SmmContentAsset.id == publication.asset_id, SmmContentAsset.content_id == content.id).first()

    log = SmmPublishLog(content_id=content.id, project_id=project.id, channel=channel, published_by_id=getattr(user, "id", None))
    try:
        result = await _deliver(db, project, publication, asset)
        delivered_status = SmmPublicationStatus.FEED_READY.value if channel == "zen" else SmmPublicationStatus.SUCCESS.value
        publication.status, publication.external_id, publication.external_url, publication.published_at = (
            delivered_status, result.external_id, result.external_url, datetime.now(timezone.utc),
        )
        log.status, log.external_id, log.external_url = delivered_status, result.external_id, result.external_url
    except Exception as exc:  # noqa: BLE001 — внешний API, ошибка должна попасть в аудит, не в 500
        publication.status, publication.last_error = SmmPublicationStatus.ERROR.value, str(exc)
        log.status, log.error = "error", str(exc)
    db.add(log)
    db.commit()
    db.refresh(log)
    if log.status == "error":
        raise ValueError(log.error or "Публикация не удалась")
    return log


def create_publications(
    db: Session, user, *, project: SmmProject, items: Iterable[Dict[str, Optional[int]]], publish_at: Optional[datetime],
) -> List[SmmPublication]:
    """Ручной bundle (несколько каналов за раз), с опциональным переносом на
    будущее время — approve здесь = явное разрешение на автопубликацию."""
    now = datetime.now(timezone.utc)
    publications = []
    for item in items:
        channel, content_id = str(item.get("channel") or "").lower(), int(item.get("content_id") or 0)
        if channel not in SUPPORTED_CHANNELS:
            raise ValueError(f"Канал «{channel}» не поддерживается")
        content = db.query(SmmContent).filter(SmmContent.id == content_id, SmmContent.project_id == project.id).first()
        if content is None:
            raise ValueError("Материал не найден в выбранном проекте")
        if content.status != "approved":
            raise ValueError(f"Материал #{content.id} можно публиковать только после одобрения")
        _ensure_carousel_assets(db, content, channel)
        asset_id = item.get("asset_id")
        if asset_id is None:
            asset_id = _asset_id_for_channel(db, content, channel)
        if channel in CHANNELS_WITHOUT_ASSETS:
            asset_id = None
        if asset_id:
            selected_asset = db.query(SmmContentAsset).filter(SmmContentAsset.id == asset_id, SmmContentAsset.content_id == content.id).first()
            if not selected_asset:
                raise ValueError("Выбранный visual не принадлежит материалу")
            target_channel = _asset_target_channel(selected_asset)
            if target_channel and target_channel != channel:
                raise ValueError(f"Выбранный визуал подготовлен для площадки «{target_channel}», а публикация — для «{channel}»")
        text = _publication_text(content, channel=channel)
        if not text and not asset_id:
            raise ValueError(f"Материал #{content.id} не содержит текста или изображения")
        scheduled = publish_at if publish_at and publish_at > now else None
        state = SmmPublicationStatus.SCHEDULED.value if scheduled else SmmPublicationStatus.APPROVED.value
        idem = f"publication:{content.id}:{channel}:{scheduled.isoformat() if scheduled else 'now'}"
        existing = db.query(SmmPublication).filter(SmmPublication.idempotency_key == idem).first()
        if existing:
            if existing.status == SmmPublicationStatus.ERROR.value:
                # Для немедленной публикации idempotency_key не зависит от
                # времени ("...:now"), поэтому без этой ветки повторный клик
                # «Опубликовать» после сбоя (например, протух токен) просто
                # возвращал ту же ошибку снова, ни разу не вызывая publisher —
                # task_smm_publication.send() ниже запускается только для
                # status == approved, а не error.
                existing.text_snapshot, existing.asset_id = text, asset_id
                existing.status, existing.scheduled_at = state, scheduled
                existing.approved_by_id, existing.approved_at = getattr(user, "id", None), now
                existing.last_error, existing.external_id, existing.external_url = None, None, None
                publications.append(existing)
                continue
            publications.append(existing)
            continue
        row = SmmPublication(
            content_id=content.id, project_id=project.id, channel=channel, asset_id=asset_id, text_snapshot=text,
            status=state, scheduled_at=scheduled, approved_by_id=getattr(user, "id", None), approved_at=now,
            idempotency_key=idem,
        )
        db.add(row)
        publications.append(row)
    db.commit()
    for row in publications:
        db.refresh(row)
    return publications


async def process_publication(db: Session, publication_id: int) -> Optional[SmmPublication]:
    """Вызывается фоновой задачей — ручной клик здесь уже случился раньше
    (approve/schedule), это только исполнение. Идемпотентно по claim-статусу."""
    row = db.query(SmmPublication).filter(SmmPublication.id == publication_id).first()
    if row is None or row.status in (
        SmmPublicationStatus.SUCCESS.value,
        SmmPublicationStatus.FEED_READY.value,
        SmmPublicationStatus.CANCELLED.value,
    ):
        return row
    now = datetime.now(timezone.utc)
    if row.status == SmmPublicationStatus.SCHEDULED.value and row.scheduled_at and row.scheduled_at > now:
        return row
    claimed = (
        db.query(SmmPublication)
        .filter(SmmPublication.id == publication_id, SmmPublication.status.in_([SmmPublicationStatus.APPROVED.value, SmmPublicationStatus.SCHEDULED.value]))
        .update({"status": SmmPublicationStatus.PUBLISHING.value, "started_at": now, "attempt_count": SmmPublication.attempt_count + 1}, synchronize_session=False)
    )
    db.commit()
    if claimed != 1:
        return db.query(SmmPublication).filter(SmmPublication.id == publication_id).first()
    row = db.query(SmmPublication).filter(SmmPublication.id == publication_id).first()
    project = db.query(SmmProject).filter(SmmProject.id == row.project_id).first()
    asset = db.query(SmmContentAsset).filter(SmmContentAsset.id == row.asset_id, SmmContentAsset.content_id == row.content_id).first() if row.asset_id else None
    status_before = row.status
    try:
        result = await _deliver(db, project, row, asset)
        delivered_status = SmmPublicationStatus.FEED_READY.value if row.channel == "zen" else SmmPublicationStatus.SUCCESS.value
        row.status, row.external_id, row.external_url, row.published_at, row.last_error = (
            delivered_status, result.external_id, result.external_url, datetime.now(timezone.utc), None,
        )
        log_status, error = delivered_status, None
    except Exception as exc:  # noqa: BLE001
        row.status, row.last_error = SmmPublicationStatus.ERROR.value, str(exc)
        log_status, error = "error", str(exc)
    db.add(SmmPublishLog(
        content_id=row.content_id, project_id=row.project_id, channel=row.channel, status=log_status,
        external_id=row.external_id, external_url=row.external_url, error=error, published_by_id=row.approved_by_id,
    ))
    db.commit()
    logger.info(
        "smm_publication processed",
        extra={
            "publication_id": row.id,
            "project_code": getattr(project, "code", None),
            "channel": row.channel,
            "status_before": status_before,
            "status_after": row.status,
            "external_id": row.external_id,
            "error": error,
        },
    )
    return row


def due_publication_ids(db: Session, limit: int = 100) -> List[int]:
    now = datetime.now(timezone.utc)
    return [
        row[0]
        for row in db.query(SmmPublication.id)
        .filter(SmmPublication.status == SmmPublicationStatus.SCHEDULED.value, SmmPublication.scheduled_at <= now)
        .order_by(SmmPublication.scheduled_at)
        .limit(limit)
        .all()
    ]


def list_publications(db: Session, content_id: int) -> List[SmmPublication]:
    return db.query(SmmPublication).filter(SmmPublication.content_id == content_id).order_by(SmmPublication.created_at.desc()).all()


def list_publish_logs(db: Session, content: SmmContent) -> List[SmmPublishLog]:
    return db.query(SmmPublishLog).filter(SmmPublishLog.content_id == content.id).order_by(SmmPublishLog.created_at.desc()).all()
