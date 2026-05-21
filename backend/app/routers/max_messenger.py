"""
Отправка сообщений в мессенджер MAX. Доступ: admin, owner, sales.
Документация: https://dev.max.ru/docs-api
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, Lead, LeadCommunication, MaxMessage
from app.schemas import MaxSendRequest, MaxSendResponse
from app.utils.phone import normalize_phone
from app.services.max_messenger import (
    send_message,
    send_message_personal,
    is_configured,
    is_personal_configured,
    get_personal_provider,
    get_personal_qr,
    MAX_MESSAGE_TEXT_LIMIT,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/max/configured")
def api_max_configured(
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    """Проверка: настроен ли MAX (бот и/или личный аккаунт)."""
    return {
        "configured": is_configured(),
        "personal": is_personal_configured(),
        "personal_provider": get_personal_provider() or None,  # "greenapi" | "api_messenger" | null
    }


@router.get("/max/personal/qr")
def api_max_personal_qr(
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    """QR-код для привязки личного MAX в api-messenger.com (сканируй в приложении сервиса)."""
    if not is_personal_configured():
        raise HTTPException(status_code=503, detail="MAX личный аккаунт не настроен (MAX_PERSONAL_TOKEN)")
    ok, img_b64, err = get_personal_qr()
    if not ok:
        raise HTTPException(status_code=502, detail=err or "Не удалось получить QR")
    return {"img": img_b64}


def _prepare_max_message(
    payload: MaxSendRequest,
    db: Session,
) -> Tuple[str, Optional[Lead], Optional[int], Optional[str], bool, Optional[str]]:
    """Подготовить параметры отправки: текст, лид, max_user_id, phone, use_phone, chat_id_for_personal."""
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Введите текст сообщения")
    if len(message) > MAX_MESSAGE_TEXT_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов",
        )

    user_id: Optional[int] = payload.max_user_id
    phone: Optional[str] = (payload.phone or "").strip() or None
    lead: Optional[Lead] = None
    if payload.lead_id is not None:
        lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        if user_id is None:
            user_id = lead.max_user_id
        if not phone:
            phone = (lead.parent_phone or lead.phone or "").strip() or None

    use_phone = False
    chat_id_for_personal: Optional[str] = None
    if is_personal_configured() and get_personal_provider() == "greenapi" and phone:
        normalized = normalize_phone(phone)
        if normalized and (normalized.startswith("+7") or normalized.startswith("+375")):
            digits = normalized.lstrip("+")
            chat_id_for_personal = f"{digits}@c.us"
            use_phone = True

    if not use_phone and user_id is None:
        raise HTTPException(
            status_code=400,
            detail="Укажите номер телефона получателя (для GREEN-API) или MAX user_id (число из профиля в MAX).",
        )

    return message, lead, user_id, phone, use_phone, chat_id_for_personal


def _send_max_immediately(
    message: str,
    lead: Optional[Lead],
    user_id: Optional[int],
    use_phone: bool,
    chat_id_for_personal: Optional[str],
    db: Session,
    current_user: User,
) -> MaxSendResponse:
    if is_personal_configured() and use_phone and chat_id_for_personal:
        success, message_id, err = send_message_personal(chat_id_for_personal, message)
    elif is_personal_configured():
        success, message_id, err = send_message_personal(str(user_id), message)
    else:
        success, message_id, err = send_message(user_id, message)  # type: ignore[arg-type]
    if not success:
        raise HTTPException(status_code=502, detail=err or "Ошибка отправки в MAX")

    # Сохранить max_user_id и залогировать коммуникацию, если есть лид
    if lead is not None:
        if user_id is not None and lead.max_user_id != user_id:
            lead.max_user_id = user_id
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
        db.commit()

    return MaxSendResponse(success=True, message_id=message_id, error=None)


@router.post("/max/send", response_model=MaxSendResponse)
def api_max_send(
    payload: MaxSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    """Отправить сообщение в MAX. Можно сразу или отложенно по времени send_at (UTC)."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="MAX не настроен")

    message, lead, user_id, phone, use_phone, chat_id_for_personal = _prepare_max_message(payload, db)
    now_utc = datetime.now(timezone.utc)
    send_at = payload.send_at

    # Немедленная отправка
    if not send_at or send_at <= now_utc:
        return _send_max_immediately(
            message=message,
            lead=lead,
            user_id=user_id,
            use_phone=use_phone,
            chat_id_for_personal=chat_id_for_personal,
            db=db,
            current_user=current_user,
        )

    # Отложенная отправка: пишем запись в max_messages, воркер отправит позже.
    m = MaxMessage(
        lead_id=lead.id if lead is not None else None,
        max_user_id=user_id,
        phone=phone,
        message=message,
        status="scheduled",
        scheduled_at=send_at.astimezone(timezone.utc),
        created_by=current_user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return MaxSendResponse(success=True, message_id=m.id, error=None)


@router.post("/max/process-scheduled", response_model=int)
def api_max_process_scheduled(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("communications.manage")),
):
    """Отправить отложенные сообщения MAX, у которых наступило время отправки."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="MAX не настроен")

    now_utc = datetime.now(timezone.utc)
    q = (
        db.query(MaxMessage)
        .filter(
            MaxMessage.status == "scheduled",
            MaxMessage.scheduled_at != None,  # noqa: E711
            MaxMessage.scheduled_at <= now_utc,
        )
        .order_by(MaxMessage.scheduled_at.asc())
        .limit(limit)
    )
    messages = q.all()
    processed = 0

    for m in messages:
        lead = None
        if m.lead_id is not None:
            lead = db.query(Lead).filter(Lead.id == m.lead_id).first()

        use_phone = False
        chat_id_for_personal: Optional[str] = None
        phone = m.phone
        user_id = m.max_user_id
        if is_personal_configured() and get_personal_provider() == "greenapi" and phone:
            normalized = normalize_phone(phone)
            if normalized and (normalized.startswith("+7") or normalized.startswith("+375")):
                digits = normalized.lstrip("+")
                chat_id_for_personal = f"{digits}@c.us"
                use_phone = True

        try:
            resp = _send_max_immediately(
                message=m.message,
                lead=lead,
                user_id=user_id,
                use_phone=use_phone,
                chat_id_for_personal=chat_id_for_personal,
                db=db,
                current_user=current_user,
            )
            m.status = "sent" if resp.success else "failed"
            m.gateway_message_id = resp.message_id
            m.sent_at = datetime.utcnow()
        except HTTPException as e:
            m.status = "failed"
            logger.warning("max_failed_scheduled: id=%s error=%s", m.id, e.detail)
        processed += 1

    db.commit()
    return processed
