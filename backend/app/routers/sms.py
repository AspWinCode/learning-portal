"""
SMS через SMS Gateway (Android). Доступ: owner, admin, sales (не trainer).
API gateway не доступен на frontend — только через backend.
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, SmsMessage, SmsTemplate, LeadCommunication
from app.schemas import (
    SmsSendRequest,
    SmsSendBulkRequest,
    SmsMessageResponse,
    SmsTemplateResponse,
)
from app.services.sms_gateway import send_sms, is_configured, SMS_MAX_LENGTH
from app.utils.phone import normalize_phone

logger = logging.getLogger(__name__)

router = APIRouter()

# Ограничение: 1 SMS / 60 сек на номер (проверяем по последней записи в sms_messages)
SMS_RATE_LIMIT_SECONDS = 60


def _normalize_phone_e164(phone: str) -> str:
    """Нормализация к E.164 для РФ: +7XXXXXXXXXX."""
    return normalize_phone(phone)


def _validate_message_length(message: str) -> None:
    if len(message) > SMS_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Текст сообщения не более {SMS_MAX_LENGTH} символов",
        )


def _check_rate_limit(db: Session, phone: str) -> None:
    """Проверить, что на этот номер не отправляли SMS в последние SMS_RATE_LIMIT_SECONDS."""
    since = datetime.utcnow() - timedelta(seconds=SMS_RATE_LIMIT_SECONDS)
    recent = (
        db.query(SmsMessage)
        .filter(
            SmsMessage.phone == phone,
            SmsMessage.status == "sent",
            SmsMessage.sent_at >= since,
        )
        .first()
    )
    if recent:
        raise HTTPException(
            status_code=429,
            detail=f"Не более одного SMS в {SMS_RATE_LIMIT_SECONDS} секунд на номер. Повторите позже.",
        )


def _sms_message_to_response(m: SmsMessage) -> SmsMessageResponse:
    return SmsMessageResponse(
        id=m.id,
        phone=m.phone,
        message=m.message,
        entity_type=m.entity_type,
        entity_id=m.entity_id,
        status=m.status,
        gateway_id=m.gateway_id,
        created_at=m.created_at,
        scheduled_at=m.scheduled_at,
        sent_at=m.sent_at,
        created_by=m.created_by,
    )


@router.post("/sms/send", response_model=SmsMessageResponse)
def api_sms_send(
    payload: SmsSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Отправить SMS немедленно или отложить. Если указан scheduled_at — сохраняется как scheduled."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="SMS Gateway не настроен")
    phone = _normalize_phone_e164(payload.phone)
    if not phone or not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Некорректный номер телефона (ожидается E.164)")
    _validate_message_length(payload.message)

    # Нормализуем scheduled_at к UTC без tzinfo для единообразного сравнения
    scheduled_at = payload.scheduled_at
    if scheduled_at is not None:
        if scheduled_at.tzinfo is not None:
            scheduled_at = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
        if scheduled_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="scheduled_at должен быть в будущем")

    # Для немедленной отправки проверяем rate-limit
    if scheduled_at is None:
        _check_rate_limit(db, phone)

    record = SmsMessage(
        phone=phone,
        message=payload.message[:SMS_MAX_LENGTH],
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        status="scheduled" if scheduled_at else "pending",
        scheduled_at=scheduled_at,
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Если отложено — возвращаем сразу
    if scheduled_at is not None:
        logger.info("sms_scheduled: id=%s phone=%s scheduled_at=%s", record.id, phone, scheduled_at)
        return _sms_message_to_response(record)

    # Немедленная отправка
    success, gateway_id, err = send_sms(phone, payload.message)
    if success:
        record.status = "sent"
        record.gateway_id = gateway_id
        record.sent_at = datetime.utcnow()
        logger.info("sms_sent: id=%s phone=%s", record.id, phone)

        if payload.entity_type == "lead" and payload.entity_id is not None:
            comm = LeadCommunication(
                lead_id=payload.entity_id,
                sent_by=current_user.id,
                template_id=None,
                channel="sms",
                message=payload.message[:SMS_MAX_LENGTH],
                pause_reason=None,
                follow_up_at=datetime.utcnow(),
            )
            db.add(comm)
    else:
        record.status = "failed"
        logger.warning("sms_failed: id=%s phone=%s error=%s", record.id, phone, err)
    db.commit()
    db.refresh(record)

    if not success:
        raise HTTPException(status_code=502, detail=err or "Ошибка отправки SMS")
    return _sms_message_to_response(record)


@router.post("/sms/send-bulk", response_model=List[SmsMessageResponse])
def api_sms_send_bulk(
    payload: SmsSendBulkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Массовая отправка SMS. Если указан scheduled_at — все номера ставятся в очередь."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="SMS Gateway не настроен")
    _validate_message_length(payload.message)

    scheduled_at = payload.scheduled_at
    if scheduled_at is not None:
        if scheduled_at.tzinfo is not None:
            scheduled_at = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
        if scheduled_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="scheduled_at должен быть в будущем")

    phones = []
    seen = set()
    for p in payload.phones:
        norm = _normalize_phone_e164(p)
        if not norm or not norm.startswith("+"):
            continue
        if norm in seen:
            continue
        seen.add(norm)
        phones.append(norm)

    if not phones:
        raise HTTPException(status_code=400, detail="Нет корректных номеров")

    results = []

    # Отложенная рассылка — только сохраняем записи
    if scheduled_at is not None:
        for phone in phones:
            record = SmsMessage(
                phone=phone,
                message=payload.message[:SMS_MAX_LENGTH],
                entity_type=None,
                entity_id=None,
                status="scheduled",
                scheduled_at=scheduled_at,
                created_by=current_user.id,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            results.append(_sms_message_to_response(record))
        logger.info("sms_bulk_scheduled: count=%d scheduled_at=%s", len(results), scheduled_at)
        return results

    # Немедленная рассылка
    for i, phone in enumerate(phones):
        _check_rate_limit(db, phone)
        record = SmsMessage(
            phone=phone,
            message=payload.message[:SMS_MAX_LENGTH],
            entity_type=None,
            entity_id=None,
            status="pending",
            created_by=current_user.id,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        success, gateway_id, err = send_sms(phone, payload.message)
        if success:
            record.status = "sent"
            record.gateway_id = gateway_id
            record.sent_at = datetime.utcnow()
        else:
            record.status = "failed"
        db.commit()
        db.refresh(record)
        results.append(_sms_message_to_response(record))
        if i < len(phones) - 1:
            time.sleep(61)
    return results


@router.get("/sms/scheduled", response_model=List[SmsMessageResponse])
def api_sms_scheduled(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Список отложенных SMS (статус scheduled)."""
    records = (
        db.query(SmsMessage)
        .filter(SmsMessage.status == "scheduled")
        .order_by(SmsMessage.scheduled_at.asc())
        .all()
    )
    return [_sms_message_to_response(r) for r in records]


@router.delete("/sms/scheduled/{message_id}", response_model=SmsMessageResponse)
def api_sms_cancel(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Отменить отложенное SMS."""
    record = db.query(SmsMessage).filter(SmsMessage.id == message_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if record.status != "scheduled":
        raise HTTPException(status_code=400, detail=f"Нельзя отменить: статус '{record.status}'")
    record.status = "cancelled"
    db.commit()
    db.refresh(record)
    logger.info("sms_cancelled: id=%s", message_id)
    return _sms_message_to_response(record)
