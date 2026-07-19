from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import EmailBroadcast, EmailBroadcastRecipient, User, UserRole
from app.schemas.email_broadcasts import (
    EmailBroadcastCreate,
    EmailBroadcastRecipientResponse,
    EmailBroadcastResponse,
    EmailBroadcastUpdate,
    RetryFailedRequest,
    SendBroadcastRequest,
    TestSendRequest,
)
from app.services.email_broadcast_service import create_recipients, record_open
from app.services.email_sender import is_email_configured, send_email_html
from app.utils.datetime import utcnow

router = APIRouter()

_ALLOWED_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.SALES}

_TRACKING_PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!"
    b"\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


def _check_access(current_user: User) -> None:
    if current_user.role not in _ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


def _to_response(broadcast: EmailBroadcast) -> EmailBroadcastResponse:
    created_by_name = None
    if broadcast.created_by:
        created_by_name = broadcast.created_by.full_name
    return EmailBroadcastResponse(
        id=broadcast.id,
        name=broadcast.name,
        subject=broadcast.subject,
        html_body=broadcast.html_body,
        plain_body=broadcast.plain_body,
        status=broadcast.status,
        created_by_id=broadcast.created_by_id,
        created_by_name=created_by_name,
        created_at=broadcast.created_at,
        sent_at=broadcast.sent_at,
        total_recipients=broadcast.total_recipients or 0,
        sent_count=broadcast.sent_count or 0,
        failed_count=broadcast.failed_count or 0,
        opened_count=broadcast.opened_count or 0,
        clicked_count=broadcast.clicked_count or 0,
    )


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.get("/email-broadcasts", response_model=List[EmailBroadcastResponse])
def list_broadcasts(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcasts = (
        db.query(EmailBroadcast)
        .order_by(EmailBroadcast.created_at.desc())
        .all()
    )
    return [_to_response(b) for b in broadcasts]


@router.post("/email-broadcasts", response_model=EmailBroadcastResponse, status_code=201)
def create_broadcast(
    payload: EmailBroadcastCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = EmailBroadcast(
        name=payload.name,
        subject=payload.subject,
        html_body=payload.html_body,
        plain_body=payload.plain_body,
        status="draft",
        created_by_id=current_user.id,
    )
    db.add(broadcast)
    db.commit()
    db.refresh(broadcast)
    return _to_response(broadcast)


@router.get("/email-broadcasts/{broadcast_id}", response_model=EmailBroadcastResponse)
def get_broadcast(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    return _to_response(broadcast)


@router.patch("/email-broadcasts/{broadcast_id}", response_model=EmailBroadcastResponse)
def update_broadcast(
    broadcast_id: int,
    payload: EmailBroadcastUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Редактировать можно только черновик")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(broadcast, field, value)
    db.commit()
    db.refresh(broadcast)
    return _to_response(broadcast)


@router.delete("/email-broadcasts/{broadcast_id}", status_code=204)
def delete_broadcast(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status == "sending":
        raise HTTPException(status_code=400, detail="Нельзя удалить рассылку в процессе отправки")
    db.delete(broadcast)
    db.commit()


# ─── SEND ────────────────────────────────────────────────────────────────────

@router.post("/email-broadcasts/{broadcast_id}/send", response_model=EmailBroadcastResponse)
def send_broadcast(
    broadcast_id: int,
    payload: SendBroadcastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="SMTP не настроен")
    if not payload.school_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одну школу")

    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Запустить можно только черновик")

    create_recipients(db, broadcast, payload.school_ids)
    db.refresh(broadcast)

    # Kick off background sending
    from app.background_tasks import task_send_email_broadcast
    task_send_email_broadcast.send(broadcast_id)

    return _to_response(broadcast)


@router.post("/email-broadcasts/{broadcast_id}/save-recipients", response_model=EmailBroadcastResponse)
def save_recipients(
    broadcast_id: int,
    payload: SendBroadcastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    """Save school recipients to a draft broadcast without sending."""
    _check_access(current_user)
    if not payload.school_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одну школу")

    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status != "draft":
        raise HTTPException(status_code=400, detail="Получателей можно сохранить только для черновика")

    # Remove previously saved recipients (allow re-selection)
    db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.broadcast_id == broadcast_id
    ).delete()
    db.flush()

    create_recipients(db, broadcast, payload.school_ids)
    # Restore draft status (create_recipients sets it to "sending" and stamps sent_at)
    broadcast.status = "draft"
    broadcast.sent_at = None
    db.commit()
    db.refresh(broadcast)
    return _to_response(broadcast)


@router.post("/email-broadcasts/{broadcast_id}/launch", response_model=EmailBroadcastResponse)
def launch_broadcast(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    """Launch sending for a draft that already has saved recipients."""
    _check_access(current_user)
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="SMTP не настроен")

    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status != "draft":
        raise HTTPException(status_code=400, detail="Запустить можно только черновик")
    if not broadcast.total_recipients:
        raise HTTPException(status_code=400, detail="Нет получателей. Сначала сохраните список школ.")

    # Reset all recipients to pending and mark broadcast as sending
    db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.broadcast_id == broadcast_id
    ).update({"status": "pending", "error_message": None})
    broadcast.status = "sending"
    broadcast.sent_at = utcnow()
    db.commit()
    db.refresh(broadcast)

    from app.background_tasks import task_send_email_broadcast
    task_send_email_broadcast.send(broadcast_id)

    return _to_response(broadcast)


@router.post("/email-broadcasts/{broadcast_id}/test-send")
def test_send_broadcast(
    broadcast_id: int,
    payload: TestSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="SMTP не настроен")

    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    ok = send_email_html(
        to_email=payload.to_email,
        subject=f"[ТЕСТ] {broadcast.subject}",
        html_body=broadcast.html_body,
        plain_body=broadcast.plain_body,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Ошибка отправки — проверьте SMTP-настройки")
    return {"ok": True}


@router.post("/email-broadcasts/{broadcast_id}/retry-failed", response_model=EmailBroadcastResponse)
def retry_failed(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    failed_count = (
        db.query(EmailBroadcastRecipient)
        .filter(
            EmailBroadcastRecipient.broadcast_id == broadcast_id,
            EmailBroadcastRecipient.status == "failed",
        )
        .update({"status": "pending", "error_message": None})
    )
    if failed_count == 0:
        raise HTTPException(status_code=400, detail="Нет получателей со статусом 'failed'")

    broadcast.status = "sending"
    db.commit()
    db.refresh(broadcast)

    from app.background_tasks import task_send_email_broadcast
    task_send_email_broadcast.send(broadcast_id)

    return _to_response(broadcast)


# ─── ANALYTICS ───────────────────────────────────────────────────────────────

@router.get("/email-broadcasts/{broadcast_id}/recipients", response_model=List[EmailBroadcastRecipientResponse])
def list_recipients(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    recipients = (
        db.query(EmailBroadcastRecipient)
        .filter(EmailBroadcastRecipient.broadcast_id == broadcast_id)
        .order_by(EmailBroadcastRecipient.id)
        .all()
    )
    return recipients


# ─── TRACKING (public, no auth) ──────────────────────────────────────────────

@router.get("/mail-track/open/{token}", include_in_schema=False)
def track_open(token: str, db: Session = Depends(get_db)):
    try:
        record_open(db, token)
    except Exception:
        pass
    return Response(
        content=_TRACKING_PIXEL,
        media_type="image/gif",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )
