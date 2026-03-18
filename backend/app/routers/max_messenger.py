"""
Отправка сообщений в мессенджер MAX. Доступ: admin, owner, sales.
Документация: https://dev.max.ru/docs-api
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, Lead, LeadCommunication, MaxMessage
from app.schemas import MaxSendRequest, MaxSendResponse, MaxMessageResponse
from app.utils.phone import normalize_phone
from app.services.max_messenger import (
    send_message,
    send_message_personal,
    is_configured,
    is_personal_configured,
    get_personal_provider,
    get_personal_qr,
    check_user_exists_bot,
    check_phone_greenapi,
    MAX_MESSAGE_TEXT_LIMIT,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_target(payload: MaxSendRequest, lead: Optional[Lead]):
    """Вернуть (user_id, phone, chat_id_for_personal, use_phone, provider)."""
    user_id = payload.max_user_id
    phone = (payload.phone or "").strip() or None

    if lead is not None:
        if user_id is None:
            user_id = getattr(lead, "max_user_id", None)
        if not phone:
            phone = (getattr(lead, "parent_phone", None) or getattr(lead, "phone", None) or "").strip() or None

    use_phone = False
    chat_id_for_personal = None
    if is_personal_configured() and get_personal_provider() == "greenapi" and phone:
        normalized = normalize_phone(phone)
        if normalized and (normalized.startswith("+7") or normalized.startswith("+375")):
            digits = normalized.lstrip("+")
            chat_id_for_personal = f"{digits}@c.us"
            use_phone = True

    provider = get_personal_provider() if is_personal_configured() else "bot"
    return user_id, phone, chat_id_for_personal, use_phone, provider


@router.get("/max/configured")
def api_max_configured(
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Проверка: настроен ли MAX (бот и/или личный аккаунт)."""
    return {
        "configured": is_configured(),
        "personal": is_personal_configured(),
        "personal_provider": get_personal_provider() or None,
    }


@router.get("/max/personal/qr")
def api_max_personal_qr(
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """QR-код для привязки личного MAX в api-messenger.com."""
    if not is_personal_configured():
        raise HTTPException(status_code=503, detail="MAX личный аккаунт не настроен (MAX_PERSONAL_TOKEN)")
    ok, img_b64, err = get_personal_qr()
    if not ok:
        raise HTTPException(status_code=502, detail=err or "Не удалось получить QR")
    return {"img": img_b64}


@router.get("/max/check-user")
def api_max_check_user(
    max_user_id: Optional[int] = None,
    phone: Optional[str] = None,
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Проверить, существует ли пользователь в MAX (до отправки)."""
    if not is_configured():
        return {"exists": True}  # не настроен — не блокируем

    provider = get_personal_provider() if is_personal_configured() else "bot"

    if provider == "greenapi" and phone:
        normalized = normalize_phone(phone)
        if normalized:
            digits = normalized.lstrip("+")
            exists, _ = check_phone_greenapi(digits)
            return {"exists": exists}
        return {"exists": True}

    if max_user_id is not None and provider == "bot":
        exists, _ = check_user_exists_bot(max_user_id)
        return {"exists": exists}

    return {"exists": True}


@router.post("/max/send", response_model=MaxSendResponse)
def api_max_send(
    payload: MaxSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Отправить сообщение в MAX немедленно или отложить (scheduled_at)."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="MAX не настроен")

    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Введите текст сообщения")
    if len(message) > MAX_MESSAGE_TEXT_LIMIT:
        raise HTTPException(status_code=400, detail=f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов")

    # Нормализуем scheduled_at к UTC без tzinfo
    scheduled_at = payload.scheduled_at
    if scheduled_at is not None:
        if scheduled_at.tzinfo is not None:
            scheduled_at = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
        if scheduled_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="scheduled_at должен быть в будущем")

    lead = None
    if payload.lead_id is not None:
        lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")

    user_id, phone, chat_id_for_personal, use_phone, provider = _resolve_target(payload, lead)

    if not use_phone and user_id is None:
        raise HTTPException(
            status_code=400,
            detail="Укажите номер телефона (для GREEN-API) или MAX user_id.",
        )

    # Сохранить запись о сообщении
    record = MaxMessage(
        id=str(uuid.uuid4()),
        lead_id=payload.lead_id,
        max_user_id=user_id,
        phone=phone,
        chat_id=chat_id_for_personal or (str(user_id) if user_id else None),
        message=message,
        status="scheduled" if scheduled_at else "pending",
        provider=provider,
        scheduled_at=scheduled_at,
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Если отложено — возвращаем сразу
    if scheduled_at is not None:
        logger.info("max_scheduled: id=%s scheduled_at=%s", record.id, scheduled_at)
        return MaxSendResponse(success=True, message_id=record.id, error=None, scheduled=True)

    # Немедленная отправка
    if is_personal_configured() and use_phone and chat_id_for_personal:
        success, message_id, err = send_message_personal(chat_id_for_personal, message)
    elif is_personal_configured():
        success, message_id, err = send_message_personal(str(user_id), message)
    else:
        success, message_id, err = send_message(user_id, message)

    if success:
        record.status = "sent"
        record.gateway_message_id = message_id
        record.sent_at = datetime.utcnow()
        logger.info("max_sent: id=%s", record.id)

        if lead is not None:
            if payload.max_user_id is not None:
                lead.max_user_id = payload.max_user_id
            comm = LeadCommunication(
                lead_id=lead.id,
                sent_by=current_user.id,
                template_id=None,
                channel="max",
                message=message,
                pause_reason=None,
                follow_up_at=datetime.utcnow(),
            )
            db.add(comm)
    else:
        record.status = "failed"
        logger.warning("max_failed: id=%s error=%s", record.id, err)

    db.commit()
    db.refresh(record)

    if not success:
        raise HTTPException(status_code=502, detail=err or "Ошибка отправки в MAX")
    return MaxSendResponse(success=True, message_id=message_id, error=None, scheduled=False)


@router.get("/max/scheduled", response_model=List[MaxMessageResponse])
def api_max_scheduled(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Список отложенных сообщений MAX (статус scheduled)."""
    records = (
        db.query(MaxMessage)
        .filter(MaxMessage.status == "scheduled")
        .order_by(MaxMessage.scheduled_at.asc())
        .all()
    )
    return [
        MaxMessageResponse(
            id=r.id,
            lead_id=r.lead_id,
            max_user_id=r.max_user_id,
            phone=r.phone,
            message=r.message,
            status=r.status,
            provider=r.provider,
            gateway_message_id=r.gateway_message_id,
            created_at=r.created_at,
            scheduled_at=r.scheduled_at,
            sent_at=r.sent_at,
            created_by=r.created_by,
        )
        for r in records
    ]


@router.delete("/max/scheduled/{message_id}", response_model=MaxMessageResponse)
def api_max_cancel(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Отменить отложенное сообщение MAX."""
    record = db.query(MaxMessage).filter(MaxMessage.id == message_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if record.status != "scheduled":
        raise HTTPException(status_code=400, detail=f"Нельзя отменить: статус '{record.status}'")
    record.status = "cancelled"
    db.commit()
    db.refresh(record)
    logger.info("max_cancelled: id=%s", message_id)
    return MaxMessageResponse(
        id=record.id,
        lead_id=record.lead_id,
        max_user_id=record.max_user_id,
        phone=record.phone,
        message=record.message,
        status=record.status,
        provider=record.provider,
        gateway_message_id=record.gateway_message_id,
        created_at=record.created_at,
        scheduled_at=record.scheduled_at,
        sent_at=record.sent_at,
        created_by=record.created_by,
    )
