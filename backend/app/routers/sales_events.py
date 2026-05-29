from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Text, cast
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    Lead,
    LeadStatus,
    LeadStatusOption,
    LeadTask,
    LeadTaskStatus,
    LeadTaskStatusOption as LeadTaskStatusOptionModel,
    LeadTaskTemplate,
    User,
    UserRole,
)
from app.routers.action_log import log_action
from app.schemas.sales import EventCreate, EventRegistrationCreate, EventRegistrationResponse, EventResponse, EventUpdate
from app.utils.datetime import utcnow

router = APIRouter()


def _require_owner_or_admin(lead: Lead, user: User) -> None:
    if auth.resolve_effective_role(user) in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _append_note_tag(note: Optional[str], tag: str) -> str:
    source = (note or "").strip()
    if tag in source:
        return source
    return f"{tag} {source}".strip()


def _remove_note_tag(note: Optional[str], tag: str) -> str:
    if not note:
        return ""
    lower_tag = tag.lower()
    parts = [part for part in note.split() if part.lower() != lower_tag]
    return " ".join(parts).strip()


def _get_default_open_status_option_id(db: Session) -> Optional[int]:
    default_open = (
        db.query(LeadTaskStatusOptionModel)
        .filter(
            LeadTaskStatusOptionModel.is_active.is_(True),
            LeadTaskStatusOptionModel.is_closed.is_(False),
        )
        .order_by(LeadTaskStatusOptionModel.id.asc())
        .first()
    )
    return default_open.id if default_open else None


def _get_default_lead_status_option_id(db: Session, base_status: LeadStatus) -> Optional[int]:
    status_str = base_status.value if hasattr(base_status, "value") else str(base_status)
    option = (
        db.query(LeadStatusOption)
        .filter(
            LeadStatusOption.base_status == status_str,
            LeadStatusOption.is_active.is_(True),
        )
        .order_by(LeadStatusOption.id.asc())
        .first()
    )
    return option.id if option else None


def _create_auto_event_task(
    db: Session,
    *,
    lead: Lead,
    owner_id: int,
    note: str,
    due_at: datetime,
    preferred_template_keywords: List[str],
) -> LeadTask:
    template = None
    templates = (
        db.query(LeadTaskTemplate)
        .filter(LeadTaskTemplate.is_active.is_(True))
        .order_by(LeadTaskTemplate.id.asc())
        .all()
    )
    for current_template in templates:
        name = (current_template.name or "").lower()
        if any(keyword in name for keyword in preferred_template_keywords):
            template = current_template
            break
    task = LeadTask(
        lead_id=lead.id,
        owner_id=owner_id,
        template_id=template.id if template else None,
        status_option_id=_get_default_open_status_option_id(db),
        note=note,
        channel="call",
        due_at=due_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(task)
    return task


def _has_open_task_like(db: Session, lead_id: int, marker: str) -> bool:
    return (
        db.query(LeadTask)
        .filter(
            LeadTask.lead_id == lead_id,
            LeadTask.status == LeadTaskStatus.OPEN,
            LeadTask.note.isnot(None),
            cast(LeadTask.note, Text).ilike(f"%{marker}%"),
        )
        .first()
        is not None
    )


@router.get("/events", response_model=List[EventResponse])
async def list_events(
    status_filter: Optional[EventStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    query = db.query(Event).order_by(Event.starts_at.asc())
    if status_filter:
        query = query.filter(Event.status == status_filter)
    return query.all()


@router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    event = Event(
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        location=payload.location,
        capacity=payload.capacity,
        status=EventStatus.ACTIVE,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    log_action(db, current_user.id, "create", "event", event.id)
    return event


@router.put("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    log_action(db, current_user.id, "update", "event", event.id, update_data)
    return event


@router.get("/events/{event_id}/registrations", response_model=List[EventRegistrationResponse])
async def list_event_registrations(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return (
        db.query(EventRegistration)
        .filter(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.created_at.desc())
        .all()
    )


@router.post("/events/{event_id}/registrations", response_model=EventRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def create_event_registration(
    event_id: int,
    payload: EventRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    event = db.query(Event).filter(Event.id == event_id, Event.status == EventStatus.ACTIVE).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found or inactive")
    if event.capacity is not None:
        current_registered = (
            db.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event_id,
                EventRegistration.status == EventRegistrationStatus.REGISTERED,
            )
            .count()
        )
        if current_registered >= event.capacity:
            raise HTTPException(status_code=400, detail="Свободных слотов нет")

    lead = db.query(Lead).filter(Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    existing = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.lead_id == payload.lead_id,
        )
        .first()
    )
    if existing and existing.status == EventRegistrationStatus.REGISTERED:
        raise HTTPException(status_code=400, detail="Lead already registered")

    if existing:
        existing.status = EventRegistrationStatus.REGISTERED
        existing.note = payload.note
        existing.owner_id = current_user.id
        db.commit()
        db.refresh(existing)
        log_action(db, current_user.id, "restore", "event_registration", existing.id, {"event_id": event_id, "lead_id": lead.id})
        return existing

    registration = EventRegistration(
        event_id=event_id,
        lead_id=lead.id,
        owner_id=current_user.id,
        status=EventRegistrationStatus.REGISTERED,
        note=payload.note,
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)
    log_action(db, current_user.id, "create", "event_registration", registration.id, {"event_id": event_id, "lead_id": lead.id})
    return registration


@router.post("/events/{event_id}/registrations/{registration_id}/cancel", response_model=EventRegistrationResponse)
async def cancel_event_registration(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.id == registration_id,
            EventRegistration.event_id == event_id,
        )
        .first()
    )
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")

    lead = db.query(Lead).filter(Lead.id == registration.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    registration.status = EventRegistrationStatus.CANCELLED
    db.commit()
    db.refresh(registration)
    log_action(db, current_user.id, "cancel", "event_registration", registration.id, {"event_id": event_id, "lead_id": registration.lead_id})
    return registration


@router.post("/events/{event_id}/registrations/{registration_id}/confirm", response_model=EventRegistrationResponse)
async def confirm_event_registration(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.id == registration_id,
            EventRegistration.event_id == event_id,
        )
        .first()
    )
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == registration.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    registration.note = _append_note_tag(registration.note, "[confirmed]")
    db.commit()
    db.refresh(registration)
    log_action(db, current_user.id, "confirm", "event_registration", registration.id, {"event_id": event_id, "lead_id": registration.lead_id})
    return registration


@router.post("/events/{event_id}/registrations/{registration_id}/mark-came", response_model=EventRegistrationResponse)
async def mark_event_registration_came(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.id == registration_id,
            EventRegistration.event_id == event_id,
        )
        .first()
    )
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == registration.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    registration.note = _append_note_tag(_remove_note_tag(registration.note, "[no-show]"), "[came]")
    lead.status = LeadStatus.DEMO
    lead.status_option_id = _get_default_lead_status_option_id(db, LeadStatus.DEMO)
    if not getattr(lead, "post_visit_stage", None):
        lead.post_visit_stage = "new"
    db.commit()
    db.refresh(registration)
    log_action(db, current_user.id, "mark_came", "event_registration", registration.id, {"event_id": event_id, "lead_id": registration.lead_id})
    try:
        if not _has_open_task_like(db, lead.id, "[auto_attended_offer]"):
            due_at = utcnow() + timedelta(hours=24)
            auto_task = _create_auto_event_task(
                db,
                lead=lead,
                owner_id=lead.owner_id,
                note="[auto_attended_offer] После мероприятия: предложить курс",
                due_at=due_at,
                preferred_template_keywords=["курс", "предлож", "дожим", "offer"],
            )
            db.add(auto_task)
            db.flush()
            log_action(db, current_user.id, "create", "lead_task", auto_task.id, {"lead_id": lead.id, "type": "auto_attended_offer"})
            if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
                lead.next_contact_at = auto_task.due_at
            db.commit()
    except Exception:
        db.rollback()
    return registration


@router.post("/events/{event_id}/registrations/{registration_id}/mark-no-show", response_model=EventRegistrationResponse)
async def mark_event_registration_no_show(
    event_id: int,
    registration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.id == registration_id,
            EventRegistration.event_id == event_id,
        )
        .first()
    )
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    lead = db.query(Lead).filter(Lead.id == registration.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    registration.note = _append_note_tag(_remove_note_tag(registration.note, "[came]"), "[no-show]")
    if not _has_open_task_like(db, lead.id, "[auto_no_show_reactivate]"):
        due_at = utcnow() + timedelta(hours=24)
        auto_task = _create_auto_event_task(
            db,
            lead=lead,
            owner_id=lead.owner_id,
            note="[auto_no_show_reactivate] No-show: реактивация и перенос",
            due_at=due_at,
            preferred_template_keywords=["реактивац", "перезап", "no-show", "дожим"],
        )
        db.flush()
        log_action(db, current_user.id, "create", "lead_task", auto_task.id, {"lead_id": lead.id, "type": "auto_no_show_reactivate"})
        if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
            lead.next_contact_at = auto_task.due_at
    db.commit()
    db.refresh(registration)
    log_action(db, current_user.id, "mark_no_show", "event_registration", registration.id, {"event_id": event_id, "lead_id": registration.lead_id})
    return registration


@router.get("/leads/{lead_id}/event-registrations", response_model=List[EventRegistrationResponse])
async def list_lead_event_registrations(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(EventRegistration)
        .filter(EventRegistration.lead_id == lead_id)
        .order_by(EventRegistration.created_at.desc())
        .all()
    )
