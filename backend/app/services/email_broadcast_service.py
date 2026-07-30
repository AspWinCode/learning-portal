from __future__ import annotations

import logging
import os
import re
import secrets
import time
from typing import List

from sqlalchemy.orm import Session

import os
from app.models import (
    B2BSchool,
    B2BSchoolInteraction,
    B2BSchoolInteractionType,
    CampaignStage,
    EmailBroadcast,
    EmailBroadcastAttachment,
    EmailBroadcastRecipient,
    SchoolCampaign,
)

_BROADCAST_STORAGE_ROOT = os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")
from app.services.email_sender import is_email_configured, send_email_html
from app.utils.datetime import utcnow

logger = logging.getLogger(__name__)

_SEND_DELAY_SECONDS = 0.15  # ~6-7 emails/sec — well within Yandex 360 limits

# Regex matches http/https URLs inside href="..." or href='...'
_HREF_RE = re.compile(r"""href=["'](https?://[^"']+)["']""", re.IGNORECASE)


def _portal_base_url() -> str:
    return (os.getenv("PORTAL_BASE_URL") or "https://localhost").rstrip("/")


def _build_tracking_pixel_url(token: str) -> str:
    return f"{_portal_base_url()}/api/v1/mail-track/open/{token}"


def _build_click_url(token: str, target_url: str) -> str:
    import urllib.parse
    encoded = urllib.parse.quote(target_url, safe="")
    return f"{_portal_base_url()}/api/v1/mail-track/click/{token}?url={encoded}"


def _personalize(template: str, school_name: str | None, director_name: str | None) -> str:
    result = template
    result = result.replace("{{school_name}}", school_name or "")
    result = result.replace("{{director_name}}", director_name or "")
    return result


def _inject_tracking(html: str, open_token: str) -> str:
    """Inject 1×1 tracking pixel before </body> (or at end)."""
    pixel = (
        f'<img src="{_build_tracking_pixel_url(open_token)}" '
        f'width="1" height="1" alt="" style="display:none;" />'
    )
    if "</body>" in html.lower():
        idx = html.lower().rfind("</body>")
        return html[:idx] + pixel + html[idx:]
    return html + pixel


def _inject_click_tracking(html: str, token: str) -> str:
    """Replace http(s) href values with click-tracking URLs."""
    def _replace(m: re.Match) -> str:
        original = m.group(1)
        tracked = _build_click_url(token, original)
        quote = m.group(0)[5]  # ' or "
        return f"href={quote}{tracked}{quote}"

    return _HREF_RE.sub(_replace, html)


def _advance_campaign_stage(db: Session, campaign_id: int, school_id: int, target_stage_key: str) -> None:
    """Продвигает школу в кампании на указанный этап, если текущий этап стоит раньше."""
    target_stage = (
        db.query(CampaignStage)
        .filter(CampaignStage.campaign_id == campaign_id, CampaignStage.key == target_stage_key)
        .first()
    )
    if not target_stage:
        return  # этапа нет в этой кампании — игнорируем

    sc = (
        db.query(SchoolCampaign)
        .filter(SchoolCampaign.campaign_id == campaign_id, SchoolCampaign.b2b_school_id == school_id)
        .first()
    )
    if not sc:
        return  # школы нет в кампании — игнорируем

    current_stage = (
        db.query(CampaignStage)
        .filter(CampaignStage.campaign_id == campaign_id, CampaignStage.key == sc.stage)
        .first()
    )
    # Продвигаем только вперёд (никогда не откатываем)
    if not current_stage or current_stage.position < target_stage.position:
        sc.stage = target_stage_key


def create_recipients(db: Session, broadcast: EmailBroadcast, school_ids: List[int], limit: int | None = None) -> int:
    schools = db.query(B2BSchool).filter(
        B2BSchool.id.in_(school_ids),
        B2BSchool.email.isnot(None),
        B2BSchool.email != "",
    ).all()

    if limit is not None and limit > 0:
        schools = schools[:limit]

    added = 0
    for school in schools:
        token = secrets.token_urlsafe(32)
        recipient = EmailBroadcastRecipient(
            broadcast_id=broadcast.id,
            school_id=school.id,
            email=school.email.strip(),
            school_name=school.name,
            director_name=school.director,
            status="pending",
            tracking_token=token,
        )
        db.add(recipient)
        added += 1

    broadcast.total_recipients = added
    broadcast.status = "sending"
    broadcast.sent_at = utcnow()
    db.commit()
    return added


def send_broadcast(db: Session, broadcast_id: int) -> None:
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        logger.error("Broadcast %d not found", broadcast_id)
        return

    if not is_email_configured():
        broadcast.status = "failed"
        db.commit()
        logger.error("SMTP not configured, broadcast %d aborted", broadcast_id)
        return

    recipients = db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.broadcast_id == broadcast_id,
        EmailBroadcastRecipient.status == "pending",
    ).all()

    # Pre-load attachments once for the whole broadcast
    db_attachments = db.query(EmailBroadcastAttachment).filter(
        EmailBroadcastAttachment.broadcast_id == broadcast_id,
    ).all()
    attachments = [
        {
            "path": os.path.join(_BROADCAST_STORAGE_ROOT, a.storage_key),
            "filename": a.original_filename,
            "content_type": a.content_type or "application/octet-stream",
        }
        for a in db_attachments
    ] or None

    sent = 0
    failed = 0

    for recipient in recipients:
        try:
            recipient.status = "sending"
            db.commit()

            html = _personalize(broadcast.html_body, recipient.school_name, recipient.director_name)
            html = _inject_click_tracking(html, recipient.tracking_token)
            html = _inject_tracking(html, recipient.tracking_token)
            plain = _personalize(broadcast.plain_body or "", recipient.school_name, recipient.director_name) or None

            subject = _personalize(broadcast.subject, recipient.school_name, recipient.director_name)

            ok = send_email_html(
                to_email=recipient.email,
                subject=subject,
                html_body=html,
                plain_body=plain,
                list_id=f"broadcast-{broadcast_id}.portal",
                attachments=attachments,
            )

            if ok:
                recipient.status = "sent"
                recipient.sent_at = utcnow()
                sent += 1
                # Автоматически продвигаем этап в привязанной кампании
                if broadcast.campaign_id and recipient.school_id:
                    _advance_campaign_stage(db, broadcast.campaign_id, recipient.school_id, "email_sent")
            else:
                recipient.status = "failed"
                recipient.error_message = "SMTP send returned False"
                failed += 1

        except Exception as exc:
            recipient.status = "failed"
            recipient.error_message = str(exc)[:500]
            failed += 1
            logger.exception("Failed to send broadcast %d to recipient %d", broadcast_id, recipient.id)

        broadcast.sent_count = sent
        broadcast.failed_count = failed
        db.commit()
        time.sleep(_SEND_DELAY_SECONDS)

    broadcast.sent_count = sent
    broadcast.failed_count = failed
    broadcast.status = "done"
    db.commit()
    logger.info("Broadcast %d done: sent=%d failed=%d", broadcast_id, sent, failed)


def record_open(db: Session, token: str) -> None:
    recipient = db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.tracking_token == token,
    ).first()
    if not recipient:
        return

    recipient.open_count += 1
    if not recipient.opened_at:
        recipient.opened_at = utcnow()
        if recipient.status == "sent":
            recipient.status = "opened"

        # Atomic increment to avoid race condition when multiple opens happen concurrently
        db.query(EmailBroadcast).filter(EmailBroadcast.id == recipient.broadcast_id).update(
            {"opened_count": EmailBroadcast.opened_count + 1},
            synchronize_session=False,
        )
        broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == recipient.broadcast_id).first()
        if broadcast:
            # Автоматически продвигаем этап при первом открытии
            if broadcast.campaign_id and recipient.school_id:
                _advance_campaign_stage(db, broadcast.campaign_id, recipient.school_id, "email_opened")

        # Auto-create interaction in b2b school log on first open
        if recipient.school_id:
            interaction = B2BSchoolInteraction(
                b2b_school_id=recipient.school_id,
                type=B2BSchoolInteractionType.LETTER.value,
                happened_at=utcnow(),
                summary=f"Письмо «{broadcast.name if broadcast else 'рассылка'}» открыто получателем",
            )
            db.add(interaction)

    db.commit()


def record_click(db: Session, token: str) -> None:
    recipient = db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.tracking_token == token,
    ).first()
    if not recipient:
        return

    recipient.click_count += 1
    if not recipient.clicked_at:
        recipient.clicked_at = utcnow()
        if recipient.status in ("sent", "opened"):
            recipient.status = "opened"  # keep opened, click doesn't change status

        broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == recipient.broadcast_id).first()
        if broadcast:
            broadcast.clicked_count = (broadcast.clicked_count or 0) + 1

    db.commit()
