from __future__ import annotations

import logging
import os
import secrets
import time
from typing import List

from sqlalchemy.orm import Session

import os
from app.models import B2BSchool, EmailBroadcast, EmailBroadcastAttachment, EmailBroadcastRecipient

_BROADCAST_STORAGE_ROOT = os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")
from app.services.email_sender import is_email_configured, send_email_html
from app.utils.datetime import utcnow

logger = logging.getLogger(__name__)

_SEND_DELAY_SECONDS = 0.15  # ~6-7 emails/sec — well within Yandex 360 limits


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

        broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == recipient.broadcast_id).first()
        if broadcast:
            broadcast.opened_count = (broadcast.opened_count or 0) + 1

    db.commit()
