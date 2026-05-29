"""
Сервис отложенных сообщений: запускается каждую минуту через APScheduler.
Отправляет SMS и MAX-сообщения, у которых scheduled_at <= now() и status = 'scheduled'.
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import SmsMessage, MaxMessage, LeadCommunication
from app.services.sms_gateway import send_sms, is_configured as sms_is_configured
from app.services.max_messenger import (
    send_message,
    send_message_personal,
    is_configured as max_is_configured,
    is_personal_configured,
    get_personal_provider,
)
from app.utils.datetime import utcnow

logger = logging.getLogger(__name__)


def _dispatch_sms(db: Session) -> int:
    """Отправить все просроченные отложенные SMS. Возвращает кол-во отправленных."""
    if not sms_is_configured():
        return 0

    now = utcnow()
    pending = (
        db.query(SmsMessage)
        .filter(SmsMessage.status == "scheduled", SmsMessage.scheduled_at <= now)
        .order_by(SmsMessage.scheduled_at.asc())
        .all()
    )
    sent_count = 0
    for record in pending:
        try:
            success, gateway_id, err = send_sms(record.phone, record.message)
            if success:
                record.status = "sent"
                record.gateway_id = gateway_id
                record.sent_at = utcnow()
                sent_count += 1
                logger.info("scheduled_sms_sent: id=%s phone=%s", record.id, record.phone)

                # Лог коммуникации лида
                if record.entity_type == "lead" and record.entity_id is not None:
                    comm = LeadCommunication(
                        lead_id=record.entity_id,
                        sent_by=record.created_by,
                        template_id=None,
                        channel="sms",
                        message=record.message,
                        pause_reason=None,
                        follow_up_at=utcnow(),
                    )
                    db.add(comm)
            else:
                record.status = "failed"
                logger.warning("scheduled_sms_failed: id=%s error=%s", record.id, err)
        except Exception:
            logger.exception("scheduled_sms_error: id=%s", record.id)
            record.status = "failed"
        db.commit()
    return sent_count


def _dispatch_max(db: Session) -> int:
    """Отправить все просроченные отложенные MAX-сообщения. Возвращает кол-во отправленных."""
    if not max_is_configured():
        return 0

    now = utcnow()
    pending = (
        db.query(MaxMessage)
        .filter(MaxMessage.status == "scheduled", MaxMessage.scheduled_at <= now)
        .order_by(MaxMessage.scheduled_at.asc())
        .all()
    )
    sent_count = 0
    for record in pending:
        try:
            provider = record.provider or ""
            chat_id = record.chat_id or ""
            max_user_id = record.max_user_id

            if is_personal_configured() and chat_id:
                success, message_id, err = send_message_personal(chat_id, record.message)
            elif max_user_id is not None:
                success, message_id, err = send_message(max_user_id, record.message)
            else:
                logger.warning("scheduled_max_skip: id=%s no chat_id or user_id", record.id)
                record.status = "failed"
                db.commit()
                continue

            if success:
                record.status = "sent"
                record.gateway_message_id = message_id
                record.sent_at = utcnow()
                sent_count += 1
                logger.info("scheduled_max_sent: id=%s", record.id)

                if record.lead_id is not None:
                    comm = LeadCommunication(
                        lead_id=record.lead_id,
                        sent_by=record.created_by,
                        template_id=None,
                        channel="max",
                        message=record.message,
                        pause_reason=None,
                        follow_up_at=utcnow(),
                    )
                    db.add(comm)
            else:
                record.status = "failed"
                logger.warning("scheduled_max_failed: id=%s error=%s", record.id, err)
        except Exception:
            logger.exception("scheduled_max_error: id=%s", record.id)
            record.status = "failed"
        db.commit()
    return sent_count


def dispatch_scheduled_messages(db: Session) -> dict:
    """
    Точка входа для APScheduler: отправить все просроченные отложенные сообщения.
    Возвращает {'sms': N, 'max': N}.
    """
    sms_count = _dispatch_sms(db)
    max_count = _dispatch_max(db)
    if sms_count or max_count:
        logger.info("scheduled_dispatch: sms=%d max=%d", sms_count, max_count)
    return {"sms": sms_count, "max": max_count}
