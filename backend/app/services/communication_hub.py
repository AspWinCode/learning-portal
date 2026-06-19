import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import CommunicationQueue, Lead, MaxMessage, SmsMessage, SmsTemplate, Student, StudentCard, User
from app.services.email_sender import is_email_configured, send_email
from app.services.max_messenger import is_configured as max_is_configured
from app.services.max_messenger import send_message, send_message_personal
from app.services.sms_gateway import is_configured as sms_is_configured
from app.services.sms_gateway import send_sms
from app.utils.datetime import utcnow

logger = logging.getLogger(__name__)

SUPPORTED_CHANNELS = {"sms", "email", "max", "telegram", "web_push"}
FINAL_STATUSES = {"sent", "failed", "cancelled"}
RETRY_LIMIT = 3
DEDUPE_WINDOW_HOURS = 24


class _SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _render(value: Optional[str], context: Dict[str, Any]) -> Optional[str]:
    if value is None:
        return None
    try:
        return value.format_map(_SafeFormatDict(context))
    except Exception:
        logger.exception("communication_template_render_failed")
        return value


def _retry_delay(attempt_count: int) -> timedelta:
    if attempt_count <= 0:
        return timedelta(seconds=0)
    if attempt_count == 1:
        return timedelta(minutes=5)
    if attempt_count == 2:
        return timedelta(minutes=15)
    return timedelta(minutes=60)


def _resolve_template(
    db: Session,
    *,
    channel: str,
    template_id: Optional[int],
    event_key: Optional[str],
) -> Optional[SmsTemplate]:
    if template_id is not None:
        return (
            db.query(SmsTemplate)
            .filter(SmsTemplate.id == template_id, SmsTemplate.active == True)  # noqa: E712
            .first()
        )
    if event_key:
        return (
            db.query(SmsTemplate)
            .filter(
                SmsTemplate.event_key == event_key,
                SmsTemplate.channel == channel,
                SmsTemplate.active == True,  # noqa: E712
            )
            .order_by(SmsTemplate.id.asc())
            .first()
        )
    return None


def _resolve_recipient(
    db: Session,
    *,
    recipient_type: str,
    recipient_id: int,
) -> Dict[str, Any]:
    if recipient_type == "user":
        user = db.query(User).filter(User.id == recipient_id).first()
        if not user:
            raise ValueError("Recipient user not found")
        return {
            "recipient_name": user.full_name,
            "email": user.email,
            "phone": (user.phone or "").strip() or None,
            "chat_id": str(user.telegram_chat_id) if user.telegram_chat_id else None,
        }

    if recipient_type == "student":
        student = db.query(Student).filter(Student.id == recipient_id).first()
        if not student:
            raise ValueError("Recipient student not found")
        parent = db.query(User).filter(User.id == student.parent_id).first() if student.parent_id else None
        card = db.query(StudentCard).filter(StudentCard.student_id == recipient_id).first()
        card_parent_email = (card.parent_email or "").strip() if card else ""
        card_parent_telegram = (card.parent_telegram or "").strip() if card else ""
        card_preferred_messenger = (card.preferred_messenger or "").strip() if card else ""
        return {
            "recipient_name": student.full_name,
            "email": card_parent_email or (parent.email if parent else None),
            "phone": None,
            "chat_id": card_parent_telegram or (str(parent.telegram_chat_id) if parent and parent.telegram_chat_id else None),
            "preferred_messenger": card_preferred_messenger or None,
            "parent_name": parent.full_name if parent else None,
        }

    if recipient_type == "lead":
        lead = db.query(Lead).filter(Lead.id == recipient_id).first()
        if not lead:
            raise ValueError("Recipient lead not found")
        return {
            "recipient_name": lead.full_name,
            "email": (lead.email or "").strip() or None,
            "phone": (lead.parent_phone or lead.phone or "").strip() or None,
            "max_user_id": lead.max_user_id,
        }

    raise ValueError("Unsupported recipient type")


def _build_dedupe_key(
    *,
    recipient_type: str,
    recipient_id: int,
    channel: str,
    template_id: Optional[int],
    event_key: Optional[str],
    message: str,
) -> str:
    source = {
        "recipient_type": recipient_type,
        "recipient_id": recipient_id,
        "channel": channel,
        "template_id": template_id,
        "event_key": event_key,
        "message": message.strip(),
    }
    return json.dumps(source, ensure_ascii=True, sort_keys=True)[:255]


class CommunicationService:
    @staticmethod
    def send(
        db: Session,
        *,
        channel: str,
        recipient_type: str,
        recipient_id: int,
        context: Dict[str, Any],
        template_id: Optional[int] = None,
        event_key: Optional[str] = None,
        created_by: Optional[int] = None,
        dedupe_key: Optional[str] = None,
    ) -> CommunicationQueue:
        normalized_channel = (channel or "").strip().lower()
        if normalized_channel not in SUPPORTED_CHANNELS:
            raise ValueError("Unsupported communication channel")

        template = _resolve_template(
            db,
            channel=normalized_channel,
            template_id=template_id,
            event_key=event_key,
        )
        recipient_payload = _resolve_recipient(
            db,
            recipient_type=recipient_type,
            recipient_id=recipient_id,
        )
        merged_context = {**recipient_payload, **(context or {})}
        body = _render(template.text, merged_context) if template else str(context.get("message") or "").strip()
        if not body:
            raise ValueError("Communication message is empty")
        subject = _render(template.subject, merged_context) if template else str(context.get("subject") or "").strip() or None
        dedupe_value = dedupe_key or _build_dedupe_key(
            recipient_type=recipient_type,
            recipient_id=recipient_id,
            channel=normalized_channel,
            template_id=template.id if template else template_id,
            event_key=template.event_key if template else event_key,
            message=body,
        )

        duplicate_since = utcnow() - timedelta(hours=DEDUPE_WINDOW_HOURS)
        duplicate = (
            db.query(CommunicationQueue)
            .filter(
                CommunicationQueue.dedupe_key == dedupe_value,
                CommunicationQueue.created_at >= duplicate_since,
                CommunicationQueue.status.in_(["pending", "sending", "sent"]),
            )
            .order_by(CommunicationQueue.created_at.desc())
            .first()
        )
        if duplicate is not None:
            return duplicate

        payload = {
            "subject": subject,
            "message": body,
            "context": merged_context,
            "email": recipient_payload.get("email"),
            "phone": recipient_payload.get("phone"),
            "chat_id": recipient_payload.get("chat_id"),
            "max_user_id": recipient_payload.get("max_user_id"),
            "preferred_messenger": recipient_payload.get("preferred_messenger"),
        }
        item = CommunicationQueue(
            recipient_type=recipient_type,
            recipient_id=recipient_id,
            channel=normalized_channel,
            template_id=template.id if template else template_id,
            payload=payload,
            status="pending",
            attempt_count=0,
            dedupe_key=dedupe_value,
            created_by=created_by,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def dispatch_pending(db: Session, limit: int = 100) -> int:
        now = utcnow()
        candidates = (
            db.query(CommunicationQueue)
            .filter(CommunicationQueue.status == "pending")
            .order_by(CommunicationQueue.created_at.asc())
            .limit(limit)
            .all()
        )
        processed = 0
        for item in candidates:
            if item.last_attempt_at is not None and item.last_attempt_at + _retry_delay(int(item.attempt_count or 0)) > now:
                continue
            CommunicationService._dispatch_one(db, item, now)
            processed += 1
        return processed

    @staticmethod
    def _dispatch_one(db: Session, item: CommunicationQueue, now: datetime) -> None:
        payload = item.payload or {}
        item.status = "sending"
        item.attempt_count = int(item.attempt_count or 0) + 1
        item.last_attempt_at = now
        db.commit()

        success, transport_id, error = _send_transport(item.channel, payload)
        if success:
            item.status = "sent"
            item.sent_at = utcnow()
            item.error = None
            _mirror_legacy_transport_log(db, item, payload, transport_id)
        else:
            item.error = (error or "Delivery failed")[:2000]
            if int(item.attempt_count or 0) >= RETRY_LIMIT:
                item.status = "failed"
            else:
                item.status = "pending"
        db.commit()


def _send_transport(channel: str, payload: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[str]]:
    message = str(payload.get("message") or "").strip()
    if not message:
        return False, None, "Message body is empty"

    if channel == "email":
        email = (payload.get("email") or "").strip()
        if not email:
            return False, None, "Recipient email is not configured"
        if not is_email_configured():
            return False, None, "Email transport is not configured"
        ok = send_email(to_email=email, subject=str(payload.get("subject") or "Notification"), body=message)
        return ok, None, None if ok else "Email transport failed"

    if channel == "sms":
        phone = (payload.get("phone") or "").strip()
        if not phone:
            return False, None, "Recipient phone is not configured"
        if not sms_is_configured():
            return False, None, "SMS transport is not configured"
        return send_sms(phone, message)

    if channel == "max":
        if not max_is_configured():
            return False, None, "MAX transport is not configured"
        max_user_id = payload.get("max_user_id")
        chat_id = (payload.get("chat_id") or "").strip()
        if chat_id:
            return send_message_personal(chat_id, message)
        if max_user_id is None:
            return False, None, "Recipient MAX account is not configured"
        return send_message(int(max_user_id), message)

    return False, None, f"Channel '{channel}' is not connected yet"


def _mirror_legacy_transport_log(
    db: Session,
    item: CommunicationQueue,
    payload: Dict[str, Any],
    transport_id: Optional[str],
) -> None:
    if not item.created_by:
        return
    message = str(payload.get("message") or "").strip()
    if item.channel == "sms" and payload.get("phone"):
        db.add(
            SmsMessage(
                phone=str(payload["phone"]),
                message=message,
                entity_type=item.recipient_type,
                entity_id=item.recipient_id,
                status="sent",
                gateway_id=transport_id,
                sent_at=item.sent_at,
                created_by=item.created_by,
            )
        )
    elif item.channel == "max":
        db.add(
            MaxMessage(
                lead_id=item.recipient_id if item.recipient_type == "lead" else None,
                max_user_id=payload.get("max_user_id"),
                chat_id=payload.get("chat_id"),
                phone=payload.get("phone"),
                message=message,
                status="sent",
                provider="communication_hub",
                gateway_message_id=transport_id,
                sent_at=item.sent_at,
                created_by=item.created_by,
            )
        )
