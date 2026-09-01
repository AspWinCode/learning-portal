from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import EmailTemplate, User
from app.schemas.email_templates import (
    EmailTemplateCreate,
    EmailTemplateResponse,
    EmailTemplateUpdate,
    TemplateTestSendRequest,
)
from app.services.email_broadcast_service import _personalize
from app.services.email_sender import is_email_configured, send_email_html

router = APIRouter()


def _check_access(current_user: User) -> None:
    """Просмотр email-шаблонов."""
    auth.ensure_permission(current_user, "communications.access")


def _check_manage(current_user: User) -> None:
    """Создание, изменение, удаление и тестовая отправка email-шаблонов."""
    auth.ensure_permission(current_user, "communications.manage")


def _to_response(t: EmailTemplate) -> EmailTemplateResponse:
    return EmailTemplateResponse(
        id=t.id,
        name=t.name,
        subject=t.subject,
        html_body=t.html_body,
        plain_body=t.plain_body,
        created_by_id=t.created_by_id,
        created_by_name=t.created_by.full_name if t.created_by else None,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("/email-templates", response_model=List[EmailTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    templates = db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc()).all()
    return [_to_response(t) for t in templates]


@router.post("/email-templates", response_model=EmailTemplateResponse, status_code=201)
def create_template(
    payload: EmailTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_manage(current_user)
    template = EmailTemplate(
        name=payload.name,
        subject=payload.subject,
        html_body=payload.html_body,
        plain_body=payload.plain_body,
        created_by_id=current_user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _to_response(template)


@router.get("/email-templates/{template_id}", response_model=EmailTemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_access(current_user)
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return _to_response(t)


@router.patch("/email-templates/{template_id}", response_model=EmailTemplateResponse)
def update_template(
    template_id: int,
    payload: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_manage(current_user)
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return _to_response(t)


@router.delete("/email-templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_manage(current_user)
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    db.delete(t)
    db.commit()


@router.post("/email-templates/{template_id}/test-send")
def test_send_template(
    template_id: int,
    payload: TemplateTestSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user),
):
    _check_manage(current_user)
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="SMTP не настроен")

    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    school_name = payload.school_name or "Пример школы №1"
    director_name = payload.director_name or "Иванов Иван Иванович"

    html = _personalize(t.html_body, school_name, director_name)
    plain = _personalize(t.plain_body or "", school_name, director_name) or None
    subject = _personalize(f"[ТЕСТ] {t.subject}", school_name, director_name)

    ok = send_email_html(
        to_email=payload.to_email,
        subject=subject,
        html_body=html,
        plain_body=plain,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Ошибка отправки — проверьте SMTP-настройки")
    return {"ok": True}
