from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import EmailBroadcast, EmailBroadcastAttachment, EmailBroadcastRecipient, SchoolCampaign, User, UserRole
from app.schemas.email_broadcasts import (
    EmailBroadcastAttachmentResponse,
    EmailBroadcastCreate,
    EmailBroadcastRecipientResponse,
    EmailBroadcastResponse,
    EmailBroadcastUpdate,
    RetryFailedRequest,
    SendBroadcastRequest,
    TestSendRequest,
)

_STORAGE_ROOT = Path(os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")).resolve()
_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # 25 MB per file
from app.services.email_broadcast_service import create_recipients, record_click, record_open
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


def _to_response(broadcast: EmailBroadcast, db: Session | None = None) -> EmailBroadcastResponse:
    created_by_name = None
    if broadcast.created_by:
        created_by_name = broadcast.created_by.full_name

    if db is not None and broadcast.status != "draft":
        from sqlalchemy import func, case
        stats = db.query(
            func.sum(case((EmailBroadcastRecipient.status == "sent", 1), else_=0)).label("sent"),
            func.sum(case((EmailBroadcastRecipient.status == "failed", 1), else_=0)).label("failed"),
        ).filter(EmailBroadcastRecipient.broadcast_id == broadcast.id).one()
        sent_count = int(stats.sent or 0)
        failed_count = int(stats.failed or 0)
    else:
        sent_count = broadcast.sent_count or 0
        failed_count = broadcast.failed_count or 0

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
        sent_count=sent_count,
        failed_count=failed_count,
        opened_count=broadcast.opened_count or 0,
        clicked_count=broadcast.clicked_count or 0,
        attachments=[
            EmailBroadcastAttachmentResponse(
                id=a.id,
                broadcast_id=a.broadcast_id,
                original_filename=a.original_filename,
                content_type=a.content_type,
                size_bytes=a.size_bytes or 0,
            )
            for a in (broadcast.attachments or [])
        ],
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
    return [_to_response(b, db) for b in broadcasts]


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
    return _to_response(broadcast, db)


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
    school_ids = list(payload.school_ids)
    if payload.campaign_id:
        extra = db.query(SchoolCampaign.b2b_school_id).filter(
            SchoolCampaign.campaign_id == payload.campaign_id
        ).all()
        school_ids = list({sid for sid, in extra} | set(school_ids))
    if not school_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одну школу")

    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Запустить можно только черновик")

    create_recipients(db, broadcast, school_ids, limit=payload.limit)
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
    school_ids = list(payload.school_ids)
    if payload.campaign_id:
        extra = db.query(SchoolCampaign.b2b_school_id).filter(
            SchoolCampaign.campaign_id == payload.campaign_id
        ).all()
        school_ids = list({sid for sid, in extra} | set(school_ids))
    if not school_ids:
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

    create_recipients(db, broadcast, school_ids, limit=payload.limit)
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


@router.post("/email-broadcasts/{broadcast_id}/resume", response_model=EmailBroadcastResponse)
def resume_broadcast(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    """Resume a stuck/interrupted broadcast by re-queuing pending recipients."""
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    # Reset any stuck 'sending' recipients back to pending
    db.query(EmailBroadcastRecipient).filter(
        EmailBroadcastRecipient.broadcast_id == broadcast_id,
        EmailBroadcastRecipient.status == "sending",
    ).update({"status": "pending"})

    pending_count = (
        db.query(EmailBroadcastRecipient)
        .filter(
            EmailBroadcastRecipient.broadcast_id == broadcast_id,
            EmailBroadcastRecipient.status == "pending",
        )
        .count()
    )
    if pending_count == 0:
        raise HTTPException(status_code=400, detail="Нет получателей для отправки")

    broadcast.status = "sending"
    db.commit()
    db.refresh(broadcast)

    from app.background_tasks import task_send_email_broadcast
    task_send_email_broadcast.send(broadcast_id)

    return _to_response(broadcast, db)


# ─── ATTACHMENTS ─────────────────────────────────────────────────────────────

@router.post("/email-broadcasts/{broadcast_id}/attachments", response_model=EmailBroadcastAttachmentResponse, status_code=201)
async def upload_attachment(
    broadcast_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if broadcast.status != "draft":
        raise HTTPException(status_code=400, detail="Вложения можно добавлять только к черновику")

    data = await file.read()
    if len(data) > _MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 25 МБ)")

    _STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    original_filename = file.filename or "attachment"
    storage_key = f"{uuid.uuid4().hex}_{original_filename}"
    dest = (_STORAGE_ROOT / storage_key).resolve()
    if _STORAGE_ROOT not in dest.parents and dest != _STORAGE_ROOT:
        raise HTTPException(status_code=500, detail="Недопустимый путь файла")
    dest.write_bytes(data)

    attachment = EmailBroadcastAttachment(
        broadcast_id=broadcast_id,
        storage_key=storage_key,
        original_filename=original_filename,
        content_type=file.content_type,
        size_bytes=len(data),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return EmailBroadcastAttachmentResponse(
        id=attachment.id,
        broadcast_id=attachment.broadcast_id,
        original_filename=attachment.original_filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
    )


@router.delete("/email-broadcasts/{broadcast_id}/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    broadcast_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    attachment = db.query(EmailBroadcastAttachment).filter(
        EmailBroadcastAttachment.id == attachment_id,
        EmailBroadcastAttachment.broadcast_id == broadcast_id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Вложение не найдено")

    try:
        path = (_STORAGE_ROOT / attachment.storage_key).resolve()
        if path.exists():
            path.unlink()
    except Exception:
        pass

    db.delete(attachment)
    db.commit()


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


@router.get("/mail-track/click/{token}", include_in_schema=False)
def track_click(token: str, url: str = Query(...), db: Session = Depends(get_db)):
    try:
        record_click(db, token)
    except Exception:
        pass
    return RedirectResponse(url=url, status_code=302)
