from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CommunicationQueue, SmsTemplate, User
from app.routers.action_log import log_action
from app.schemas.communications import (
    CommunicationQueueResponse,
    CommunicationTemplateCreate,
    CommunicationTemplateUpdate,
)
from app.schemas.sms import SmsTemplateResponse

router = APIRouter()


def _serialize_queue_item(item: CommunicationQueue) -> CommunicationQueueResponse:
    return CommunicationQueueResponse(
        id=item.id,
        recipient_type=item.recipient_type,
        recipient_id=item.recipient_id,
        channel=item.channel,
        template_id=item.template_id,
        template_name=item.template.name if item.template else None,
        status=item.status,
        attempt_count=int(item.attempt_count or 0),
        last_attempt_at=item.last_attempt_at,
        sent_at=item.sent_at,
        error=item.error,
        payload=item.payload,
        dedupe_key=item.dedupe_key,
        created_at=item.created_at,
    )


@router.get("/queue", response_model=List[CommunicationQueueResponse])
async def list_queue(
    channel: Optional[str] = Query(None),
    recipient_type: Optional[str] = Query(None),
    recipient_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("communications.access")),
):
    query = db.query(CommunicationQueue).order_by(CommunicationQueue.created_at.desc())
    if channel:
        query = query.filter(CommunicationQueue.channel == channel.strip().lower())
    if recipient_type:
        query = query.filter(CommunicationQueue.recipient_type == recipient_type.strip().lower())
    if recipient_id is not None:
        query = query.filter(CommunicationQueue.recipient_id == recipient_id)
    if status_filter:
        query = query.filter(CommunicationQueue.status == status_filter.strip().lower())
    items = query.limit(limit).all()
    return [_serialize_queue_item(item) for item in items]


@router.get("/templates", response_model=List[SmsTemplateResponse])
async def list_templates(
    channel: Optional[str] = Query(None),
    event_key: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("communications.access")),
):
    query = db.query(SmsTemplate).order_by(SmsTemplate.category.asc(), SmsTemplate.name.asc())
    if channel:
        query = query.filter(SmsTemplate.channel == channel.strip().lower())
    if event_key:
        query = query.filter(SmsTemplate.event_key == event_key.strip())
    return query.all()


@router.post("/templates", response_model=SmsTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: CommunicationTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("communications.manage")),
):
    duplicate = (
        db.query(SmsTemplate)
        .filter(
            SmsTemplate.name == payload.name,
            SmsTemplate.channel == payload.channel,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Template with this name and channel already exists")

    item = SmsTemplate(
        name=payload.name,
        category=payload.category,
        event_key=payload.event_key,
        channel=payload.channel,
        subject=payload.subject,
        text=payload.text,
        active=payload.active,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "create", "communication_template", item.id, payload.model_dump())
    return item


@router.put("/templates/{template_id}", response_model=SmsTemplateResponse)
async def update_template(
    template_id: int,
    payload: CommunicationTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("communications.manage")),
):
    item = db.query(SmsTemplate).filter(SmsTemplate.id == template_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Template not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    log_action(db, current_user.id, "update", "communication_template", item.id, update_data)
    return item
