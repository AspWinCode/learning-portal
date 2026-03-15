"""
Отправка сообщений в мессенджер MAX. Доступ: admin, owner, sales.
Документация: https://dev.max.ru/docs-api
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, Lead
from app.schemas import MaxSendRequest, MaxSendResponse
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
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Проверка: настроен ли MAX (бот и/или личный аккаунт)."""
    return {
        "configured": is_configured(),
        "personal": is_personal_configured(),
        "personal_provider": get_personal_provider() or None,  # "greenapi" | "api_messenger" | null
    }


@router.get("/max/personal/qr")
def api_max_personal_qr(
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """QR-код для привязки личного MAX в api-messenger.com (сканируй в приложении сервиса)."""
    if not is_personal_configured():
        raise HTTPException(status_code=503, detail="MAX личный аккаунт не настроен (MAX_PERSONAL_TOKEN)")
    ok, img_b64, err = get_personal_qr()
    if not ok:
        raise HTTPException(status_code=502, detail=err or "Не удалось получить QR")
    return {"img": img_b64}


@router.post("/max/send", response_model=MaxSendResponse)
def api_max_send(
    payload: MaxSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Отправить сообщение в MAX. Укажите lead_id (у лида должен быть max_user_id) или max_user_id явно."""
    if not is_configured():
        raise HTTPException(status_code=503, detail="MAX не настроен")

    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Введите текст сообщения")
    if len(message) > MAX_MESSAGE_TEXT_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов",
        )

    user_id: int | None = payload.max_user_id
    lead = None
    if payload.lead_id is not None:
        lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        if user_id is None:
            user_id = lead.max_user_id

    if user_id is None:
        raise HTTPException(
            status_code=400,
            detail="Укажите MAX user_id получателя (или сохраните его в карточке лида).",
        )

    # Личный аккаунт (api-messenger.com): сообщение от тебя. Иначе — от бота.
    if is_personal_configured():
        success, message_id, err = send_message_personal(str(user_id), message)
    else:
        success, message_id, err = send_message(user_id, message)
    if not success:
        raise HTTPException(status_code=502, detail=err or "Ошибка отправки в MAX")

    # Сохранить max_user_id в лиде, если передан явно и лид указан
    if lead is not None and payload.max_user_id is not None:
        lead.max_user_id = payload.max_user_id
        db.commit()

    return MaxSendResponse(success=True, message_id=message_id, error=None)
