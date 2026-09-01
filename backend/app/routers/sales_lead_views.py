from datetime import date, datetime, time as dt_time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Text, cast
from sqlalchemy.orm import Session, joinedload, selectinload

from app import auth
from app.database import get_db
from app.models import (
    EventRegistration,
    Invoice,
    Lead,
    LeadActivity,
    LeadCommunication,
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
from app.schemas.sales import (
    LeadActivityCreate,
    LeadActivityResponse,
    LeadCardResponse,
    LeadNextAction,
    LeadPostVisitStageUpdate,
    LeadResponse,
    LeadSidebarSummary,
)
from app.utils.datetime import utcnow
from app.services.ai_insights import build_lead_ai_insight
from app.services.lead_post_visit import update_lead_post_visit_stage as lead_post_visit_update_stage

router = APIRouter()


def _lead_eager_options():
    return (
        joinedload(Lead.owner),
        joinedload(Lead.abonement),
        joinedload(Lead.status_option),
        joinedload(Lead.source_ref),
        selectinload(Lead.tasks).joinedload(LeadTask.owner),
        selectinload(Lead.tasks).joinedload(LeadTask.template),
        selectinload(Lead.communications).joinedload(LeadCommunication.sender),
        selectinload(Lead.communications).joinedload(LeadCommunication.template),
        selectinload(Lead.invoices),
    )


def _require_owner_or_admin(lead: Lead, user: User) -> None:
    if auth.resolve_effective_role(user) in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _fix_mojibake(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return value
    for encoding in ("latin1", "cp1252"):
        try:
            fixed = value.encode(encoding).decode("utf-8")
            if fixed != value:
                return fixed
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return value


def _fix_lead_strings(lead: Lead) -> Lead:
    text_fields = [
        "contact_name",
        "phone",
        "parent_full_name",
        "child_full_name",
        "parent_phone",
        "child_phone",
        "email",
        "city",
        "school_name",
        "school_class",
        "source",
        "referral_name",
        "comment",
        "pause_reason",
        "communication_channel",
        "lost_reason",
    ]
    for field_name in text_fields:
        if hasattr(lead, field_name):
            setattr(lead, field_name, _fix_mojibake(getattr(lead, field_name)))
    return lead


def _add_activity(
    db: Session,
    lead_id: int,
    actor_id: int,
    type: str,
    title: str,
    description: Optional[str] = None,
    channel: Optional[str] = None,
    status_effect_from: Optional[str] = None,
    status_effect_to: Optional[str] = None,
    related_task_id: Optional[int] = None,
    related_invoice_id: Optional[int] = None,
    payload_json: Optional[dict] = None,
) -> LeadActivity:
    activity = LeadActivity(
        lead_id=lead_id,
        type=type,
        title=title,
        description=description,
        channel=channel,
        created_by=actor_id,
        status_effect_from=status_effect_from,
        status_effect_to=status_effect_to,
        related_task_id=related_task_id,
        related_invoice_id=related_invoice_id,
        payload_json=payload_json,
    )
    db.add(activity)
    return activity


def _filter_query_by_role(query, user: User):
    if auth.resolve_effective_role(user) in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return query
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


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


@router.get("/leads/{lead_id}/card", response_model=LeadCardResponse)
async def get_lead_card(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).options(*_lead_eager_options()).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    next_task = (
        db.query(LeadTask)
        .options(joinedload(LeadTask.owner))
        .filter(LeadTask.lead_id == lead_id, LeadTask.status == LeadTaskStatus.OPEN)
        .order_by(LeadTask.due_at.asc().nullslast())
        .first()
    )
    now = utcnow()
    today_start = datetime.combine(date.today(), dt_time.min)
    today_end = datetime.combine(date.today(), dt_time.max)
    if next_task:
        if next_task.due_at:
            if next_task.due_at < now:
                state = "overdue"
            elif today_start <= next_task.due_at <= today_end:
                state = "today"
            else:
                state = "on_time"
        else:
            state = "on_time"
        next_action = LeadNextAction(
            type="task",
            title=next_task.note or "Задача",
            due_at=next_task.due_at,
            owner_name=next_task.owner.full_name if next_task.owner else None,
            task_id=next_task.id,
            state=state,
        )
    elif lead.next_contact_at:
        if lead.next_contact_at < now:
            state = "overdue"
        elif today_start <= lead.next_contact_at <= today_end:
            state = "today"
        else:
            state = "on_time"
        next_action = LeadNextAction(
            type="contact",
            title="Связаться",
            due_at=lead.next_contact_at,
            owner_name=lead.owner.full_name if lead.owner else None,
            state=state,
        )
    else:
        next_action = LeadNextAction(state="none")

    pinned_comment = lead.comment if lead.comment else None
    upcoming_tasks = (
        db.query(LeadTask)
        .filter(LeadTask.lead_id == lead_id, LeadTask.status == LeadTaskStatus.OPEN)
        .order_by(LeadTask.due_at.asc().nullslast())
        .limit(3)
        .all()
    )
    latest_invoice = (
        db.query(Invoice)
        .filter(Invoice.lead_id == lead_id)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    sidebar = LeadSidebarSummary(
        contacts={
            "phone": lead.parent_phone or lead.phone,
            "child_phone": lead.child_phone,
            "email": lead.email,
            "telegram": (lead.questionnaire_data or {}).get("parent_telegram") if lead.questionnaire_data else None,
            "communication_channel": lead.communication_channel,
        },
        source=lead.source,
        owner_name=lead.owner.full_name if lead.owner else None,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        upcoming_tasks=[
            {"id": task.id, "note": task.note, "due_at": task.due_at.isoformat() if task.due_at else None, "status": task.status.value}
            for task in upcoming_tasks
        ],
        latest_invoice={
            "id": latest_invoice.id,
            "amount": latest_invoice.amount,
            "currency": latest_invoice.currency,
            "status": latest_invoice.status.value,
        } if latest_invoice else None,
    )
    activities = (
        db.query(LeadActivity)
        .options(joinedload(LeadActivity.creator))
        .filter(LeadActivity.lead_id == lead_id)
        .order_by(LeadActivity.created_at.desc())
        .limit(10)
        .all()
    )
    timeline_preview = [
        {
            "id": activity.id,
            "type": activity.type,
            "title": activity.title,
            "description": activity.description,
            "channel": activity.channel,
            "created_at": activity.created_at.isoformat() if activity.created_at else None,
            "creator_name": activity.creator.full_name if activity.creator else None,
            "status_effect_from": activity.status_effect_from,
            "status_effect_to": activity.status_effect_to,
        }
        for activity in activities
    ]

    lead = _fix_lead_strings(lead)
    lead.ai_insight = build_lead_ai_insight(lead)
    return {
        "lead": lead,
        "next_action": next_action,
        "pinned_comment": pinned_comment,
        "sidebar": sidebar,
        "timeline_preview": timeline_preview,
    }


@router.get("/leads/{lead_id}/timeline", response_model=List[LeadActivityResponse])
async def get_lead_timeline(
    lead_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    activities = (
        db.query(LeadActivity)
        .options(joinedload(LeadActivity.creator))
        .filter(LeadActivity.lead_id == lead_id)
        .order_by(LeadActivity.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        LeadActivityResponse(
            id=activity.id,
            lead_id=activity.lead_id,
            type=activity.type,
            title=activity.title,
            description=activity.description,
            channel=activity.channel,
            created_at=activity.created_at,
            created_by=activity.created_by,
            creator_name=activity.creator.full_name if activity.creator else None,
            payload_json=activity.payload_json,
            status_effect_from=activity.status_effect_from,
            status_effect_to=activity.status_effect_to,
            related_task_id=activity.related_task_id,
            related_invoice_id=activity.related_invoice_id,
        )
        for activity in activities
    ]


@router.post("/leads/{lead_id}/activities", response_model=LeadActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_activity(
    lead_id: int,
    payload: LeadActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.manage_leads")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    activity = LeadActivity(
        lead_id=lead_id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        channel=payload.channel,
        created_by=current_user.id,
        payload_json=payload.payload_json,
        status_effect_from=payload.status_effect_from,
        status_effect_to=payload.status_effect_to,
        related_task_id=payload.related_task_id,
        related_invoice_id=payload.related_invoice_id,
    )
    db.add(activity)
    if payload.status_effect_to and payload.status_effect_to != lead.status.value:
        lead.status = LeadStatus(payload.status_effect_to)
    if payload.type in ("call", "no_answer", "info_sent"):
        lead.last_contact_at = utcnow()

    db.commit()
    db.refresh(activity)
    creator = db.query(User).filter(User.id == activity.created_by).first()
    return LeadActivityResponse(
        id=activity.id,
        lead_id=activity.lead_id,
        type=activity.type,
        title=activity.title,
        description=activity.description,
        channel=activity.channel,
        created_at=activity.created_at,
        created_by=activity.created_by,
        creator_name=creator.full_name if creator else None,
        payload_json=activity.payload_json,
        status_effect_from=activity.status_effect_from,
        status_effect_to=activity.status_effect_to,
        related_task_id=activity.related_task_id,
        related_invoice_id=activity.related_invoice_id,
    )


@router.post("/leads/{lead_id}/post-visit-stage", response_model=LeadResponse)
async def update_lead_post_visit_stage(
    lead_id: int,
    payload: LeadPostVisitStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.manage_leads")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    try:
        result = lead_post_visit_update_stage(
            db,
            lead_id,
            stage=payload.stage,
            review=payload.review,
            project_date=payload.project_date,
            decline_reason=payload.decline_reason,
            get_default_lead_status_option_id=_get_default_lead_status_option_id,
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)

    lead = result.lead
    if result.need_auto_task and not _has_open_task_like(db, lead.id, "[auto_post_visit_agreed]"):
        due_at = utcnow() + timedelta(hours=48)
        auto_task = _create_auto_event_task(
            db,
            lead=lead,
            owner_id=lead.owner_id,
            note="[auto_post_visit_agreed] Контроль оплаты",
            due_at=due_at,
            preferred_template_keywords=["оплат", "контроль", "дожим"],
        )
        db.add(auto_task)
        db.flush()
        log_action(db, current_user.id, "create", "lead_task", auto_task.id, {"lead_id": lead.id, "type": "auto_post_visit_agreed"})
        if lead.next_contact_at is None or (auto_task.due_at and lead.next_contact_at > auto_task.due_at):
            lead.next_contact_at = auto_task.due_at

    db.commit()
    db.refresh(lead)
    log_action(
        db,
        current_user.id,
        "post_visit_stage",
        "lead",
        lead.id,
        {
            "stage": payload.stage,
            "review": payload.review,
            "project_date": payload.project_date.isoformat() if payload.project_date else None,
            "decline_reason": payload.decline_reason,
        },
    )
    return _fix_lead_strings(lead)


@router.get("/post-visit/leads", response_model=List[LeadResponse])
async def list_post_visit_leads(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    came_lead_ids = (
        db.query(EventRegistration.lead_id)
        .filter(cast(EventRegistration.note, Text).ilike("%[came]%"))
        .distinct()
    )
    leads_query = (
        _filter_query_by_role(db.query(Lead).options(*_lead_eager_options()), current_user)
        .filter(Lead.id.in_(came_lead_ids))
        .order_by(Lead.created_at.desc())
    )
    leads = leads_query.all()

    updated = False
    for lead in leads:
        if not getattr(lead, "post_visit_stage", None):
            lead.post_visit_stage = "new"
            updated = True
    if updated:
        db.commit()
        for lead in leads:
            db.refresh(lead)

    return [_fix_lead_strings(lead) for lead in leads]
