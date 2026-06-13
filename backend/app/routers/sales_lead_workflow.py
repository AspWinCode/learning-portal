from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    Lead,
    LeadActivity,
    LeadCommunication,
    LeadInfoTemplate,
    LeadStatus,
    LeadTask,
    LeadTaskStatus,
    LeadTaskStatusOption as LeadTaskStatusOptionModel,
    LeadTaskTemplate,
    Task,
    TaskStatus,
    User,
    UserRole,
)
from app.routers.action_log import log_action
from app.schemas.sales import (
    LeadCommunicationResponse,
    LeadContactResultRequest,
    LeadQuickCommunicationCreate,
    LeadSendInfoRequest,
    LeadTaskCreate,
    LeadTaskResponse,
    LeadTaskUpdate,
)
from app.utils.datetime import utcnow

router = APIRouter()

ALLOWED_PAUSE_REASONS = {"ждём ответ", "подумать", "нет времени"}
_SEND_INFO_TASK_MARKER = "отправить информацию"


def _require_owner_or_admin(lead: Lead, user: User) -> None:
    if auth.resolve_effective_role(user) in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


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


@router.get("/leads/{lead_id}/communications", response_model=List[LeadCommunicationResponse])
async def list_lead_communications(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(LeadCommunication)
        .filter(LeadCommunication.lead_id == lead_id)
        .order_by(LeadCommunication.created_at.desc())
        .all()
    )


@router.post("/leads/{lead_id}/communications", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_communication(
    lead_id: int,
    payload: LeadQuickCommunicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    channel = (payload.channel or "messenger").strip().lower()
    if channel not in {"messenger", "call", "email"}:
        raise HTTPException(status_code=400, detail="Unsupported channel")
    message = (payload.message or "").strip() or f"[quick-{channel}]"
    follow_up_at = payload.follow_up_at or utcnow()

    communication = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=None,
        channel=channel,
        message=message,
        pause_reason=None,
        follow_up_at=follow_up_at,
    )
    db.add(communication)
    if payload.follow_up_at:
        lead.next_contact_at = payload.follow_up_at
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED
    db.commit()
    db.refresh(communication)
    log_action(
        db,
        current_user.id,
        "log_communication",
        "lead",
        lead.id,
        {"channel": channel, "follow_up_at": follow_up_at.isoformat()},
    )
    return communication


@router.post("/leads/{lead_id}/send-info", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def send_info_for_lead(
    lead_id: int,
    payload: LeadSendInfoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    if payload.follow_up_at <= utcnow():
        raise HTTPException(status_code=400, detail="follow_up_at must be in the future")
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    if payload.pause_reason and payload.pause_reason not in ALLOWED_PAUSE_REASONS:
        raise HTTPException(status_code=400, detail="Unsupported pause reason")

    template_id = payload.template_id
    if template_id:
        template = db.query(LeadInfoTemplate).filter(LeadInfoTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

    communication = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=template_id,
        channel=(payload.channel or "messenger").strip(),
        message=message,
        pause_reason=payload.pause_reason,
        follow_up_at=payload.follow_up_at,
    )
    db.add(communication)

    auto_task = LeadTask(
        lead_id=lead.id,
        owner_id=current_user.id,
        note=f"[auto-follow-up] {payload.pause_reason or 'без причины'}",
        channel=(payload.channel or "messenger").strip(),
        due_at=payload.follow_up_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(auto_task)
    lead.next_contact_at = payload.follow_up_at
    lead.pause_reason = payload.pause_reason
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED
    db.commit()
    db.refresh(communication)
    log_action(
        db,
        current_user.id,
        "send_info",
        "lead",
        lead.id,
        {
            "template_id": template_id,
            "channel": payload.channel,
            "follow_up_at": payload.follow_up_at.isoformat(),
            "pause_reason": payload.pause_reason,
        },
    )
    return communication


@router.post("/leads/{lead_id}/contact-result", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def save_lead_contact_result(
    lead_id: int,
    payload: LeadContactResultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    outcome = (payload.outcome or "").strip().lower()
    if outcome not in {"connected", "no_answer", "callback"}:
        raise HTTPException(status_code=400, detail="Unsupported contact outcome")

    if outcome in {"no_answer", "callback"} and payload.follow_up_at is None:
        raise HTTPException(status_code=400, detail="follow_up_at is required for this outcome")
    if payload.follow_up_at and payload.follow_up_at <= utcnow():
        raise HTTPException(status_code=400, detail="follow_up_at must be in the future")

    label_map = {
        "connected": "дозвон",
        "no_answer": "не дозвонились",
        "callback": "перезвонить",
    }
    message = f"[contact-result] {label_map[outcome]}"
    if payload.note and payload.note.strip():
        message = f"{message}: {payload.note.strip()}"

    communication = LeadCommunication(
        lead_id=lead.id,
        sent_by=current_user.id,
        template_id=None,
        channel="call",
        message=message,
        pause_reason=None,
        follow_up_at=payload.follow_up_at or utcnow(),
    )
    db.add(communication)

    if outcome in {"no_answer", "callback"} and payload.follow_up_at:
        auto_task = LeadTask(
            lead_id=lead.id,
            owner_id=current_user.id,
            note=f"[auto-follow-up] {label_map[outcome]}",
            channel="call",
            due_at=payload.follow_up_at,
            status=LeadTaskStatus.OPEN,
        )
        db.add(auto_task)
        lead.next_contact_at = payload.follow_up_at

    if outcome in {"connected", "callback"} and lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED

    db.commit()
    db.refresh(communication)
    log_action(
        db,
        current_user.id,
        "contact_result",
        "lead",
        lead.id,
        {
            "outcome": outcome,
            "follow_up_at": payload.follow_up_at.isoformat() if payload.follow_up_at else None,
        },
    )
    return communication


@router.post("/leads/{lead_id}/tasks", response_model=LeadTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_task(
    lead_id: int,
    payload: LeadTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    if payload.template_id:
        template = (
            db.query(LeadTaskTemplate)
            .filter(LeadTaskTemplate.id == payload.template_id, LeadTaskTemplate.is_active.is_(True))
            .first()
        )
        if not template:
            raise HTTPException(status_code=404, detail="Task template not found")

    status_option_id = payload.status_option_id
    if status_option_id:
        status_option = (
            db.query(LeadTaskStatusOptionModel)
            .filter(LeadTaskStatusOptionModel.id == status_option_id, LeadTaskStatusOptionModel.is_active.is_(True))
            .first()
        )
        if not status_option:
            raise HTTPException(status_code=404, detail="Task status not found")
    else:
        default_open = (
            db.query(LeadTaskStatusOptionModel)
            .filter(
                LeadTaskStatusOptionModel.is_active.is_(True),
                LeadTaskStatusOptionModel.is_closed.is_(False),
            )
            .order_by(LeadTaskStatusOptionModel.id.asc())
            .first()
        )
        status_option_id = default_open.id if default_open else None

    task = LeadTask(
        lead_id=lead_id,
        owner_id=current_user.id,
        template_id=payload.template_id,
        status_option_id=status_option_id,
        note=payload.note,
        channel=payload.channel,
        due_at=payload.due_at,
        status=LeadTaskStatus.OPEN,
    )
    db.add(task)

    note_lower = (payload.note or "").strip().lower() if payload.note else ""
    if _SEND_INFO_TASK_MARKER in note_lower:
        title = f"Отправить информацию: {lead.parent_full_name or lead.contact_name or lead.phone or f'Лид #{lead.id}'}"
        description = f"Отправить информацию по лиду #{lead.id}"
        assignee_id = lead.owner_id or current_user.id
        common_task = Task(
            title=title,
            description=description,
            created_by_id=current_user.id,
            assigned_to_id=assignee_id,
            category="leads",
            status=TaskStatus.ACTIVE.value,
            due_at=utcnow(),
            priority="normal",
            tags=["send_info", f"lead:{lead.id}"],
        )
        db.add(common_task)

    _add_activity(
        db,
        lead_id,
        current_user.id,
        type="task_created",
        title=f"Создана задача: {payload.note or 'без названия'}",
        description=f"Срок: {payload.due_at.strftime('%d.%m.%Y %H:%M') if payload.due_at else 'не указан'}",
        related_task_id=task.id,
    )
    db.commit()
    db.refresh(task)
    log_action(db, current_user.id, "create", "lead_task", task.id, {"lead_id": lead_id})
    return task


@router.get("/leads/{lead_id}/tasks", response_model=List[LeadTaskResponse])
async def list_lead_tasks(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)
    return (
        db.query(LeadTask)
        .filter(LeadTask.lead_id == lead_id)
        .order_by(LeadTask.created_at.desc())
        .all()
    )


@router.post("/leads/{lead_id}/tasks/{task_id}/close", response_model=LeadTaskResponse)
async def close_lead_task(
    lead_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    task = (
        db.query(LeadTask)
        .options(joinedload(LeadTask.template))
        .filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = LeadTaskStatus.DONE
    closed_status = (
        db.query(LeadTaskStatusOptionModel)
        .filter(
            LeadTaskStatusOptionModel.is_active.is_(True),
            LeadTaskStatusOptionModel.is_closed.is_(True),
        )
        .order_by(LeadTaskStatusOptionModel.id.asc())
        .first()
    )
    if closed_status:
        task.status_option_id = closed_status.id
    task.updated_at = utcnow()
    db.commit()
    db.refresh(task)

    follow_up_note = "Позвонить лиду и узнать решение"
    template_name = (task.template.name if task.template else "") or ""
    note_lower = (task.note or "").lower()
    is_send_info = _SEND_INFO_TASK_MARKER in template_name.lower() or _SEND_INFO_TASK_MARKER in note_lower
    if is_send_info:
        lead.status = LeadStatus.THINKING
        default_open = (
            db.query(LeadTaskStatusOptionModel)
            .filter(
                LeadTaskStatusOptionModel.is_active.is_(True),
                LeadTaskStatusOptionModel.is_closed.is_(False),
            )
            .order_by(LeadTaskStatusOptionModel.id.asc())
            .first()
        )
        follow_up_due = utcnow() + timedelta(days=2)
        follow_up = LeadTask(
            lead_id=lead_id,
            owner_id=current_user.id,
            template_id=None,
            status_option_id=default_open.id if default_open else None,
            note=follow_up_note,
            channel=task.channel,
            due_at=follow_up_due,
            status=LeadTaskStatus.OPEN,
        )
        db.add(follow_up)
        db.commit()

    _add_activity(
        db,
        lead_id,
        current_user.id,
        type="task_done",
        title=f"Задача выполнена: {task.note or 'без названия'}",
        related_task_id=task.id,
    )
    if not is_send_info:
        db.commit()

    log_action(db, current_user.id, "close", "lead_task", task.id, {"lead_id": lead_id})
    return task


@router.put("/leads/{lead_id}/tasks/{task_id}", response_model=LeadTaskResponse)
async def update_lead_task(
    lead_id: int,
    task_id: int,
    payload: LeadTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("sales.access")),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    _require_owner_or_admin(lead, current_user)

    task = db.query(LeadTask).filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = payload.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        task.status = update_data["status"]
    if "note" in update_data:
        task.note = update_data["note"]
    if "channel" in update_data:
        task.channel = update_data["channel"]
    if "due_at" in update_data:
        task.due_at = update_data["due_at"]
    task.updated_at = utcnow()
    db.commit()
    db.refresh(task)
    log_action(db, current_user.id, "update", "lead_task", task.id, update_data)
    return task
