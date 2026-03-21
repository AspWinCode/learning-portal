from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, asc, case, cast, desc, exists, func, nullslast, or_
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.services.owner_workspace_max_sync import sync_max_messages_into_owner_workspace as run_owner_workspace_max_sync
from app.services.owner_workspace_notifications import refresh_deadline_notifications_for_user
from app.services.owner_workspace_task_order import normalize_task_sort_params
from app.models import (
    OwnerWorkspaceAuditLog,
    OwnerWorkspaceContact,
    OwnerWorkspaceMessage,
    OwnerWorkspaceNotification,
    OwnerWorkspaceProject,
    OwnerWorkspaceProjectContact,
    OwnerWorkspaceProjectParticipant,
    OwnerWorkspaceTask,
    OwnerWorkspaceTaskComment,
    OwnerWorkspaceTaskMessage,
    User,
)
from app.schemas import (
    OwnerWorkspaceAuditLogResponse,
    OwnerWorkspaceContactCreate,
    OwnerWorkspaceDigestResponse,
    OwnerWorkspaceContactResponse,
    OwnerWorkspaceContactUpdate,
    OwnerWorkspaceConversationItem,
    OwnerWorkspaceMessageCreate,
    OwnerWorkspaceMessageCreateTaskRequest,
    OwnerWorkspaceMessageLinkTaskRequest,
    OwnerWorkspaceMessageResponse,
    OwnerWorkspaceNotificationsEnvelope,
    OwnerWorkspaceNotificationResponse,
    OwnerWorkspaceProjectContactAdd,
    OwnerWorkspaceProjectCreate,
    OwnerWorkspaceProjectParticipantAdd,
    OwnerWorkspaceProjectResponse,
    OwnerWorkspaceProjectUpdate,
    OwnerWorkspaceSearchContactHit,
    OwnerWorkspaceSearchMessageHit,
    OwnerWorkspaceSearchProjectHit,
    OwnerWorkspaceSearchResponse,
    OwnerWorkspaceSearchTaskHit,
    OwnerWorkspaceTaskCommentCreate,
    OwnerWorkspaceTaskCommentResponse,
    OwnerWorkspaceTaskBulkUpdate,
    OwnerWorkspaceTaskCompleteRequest,
    OwnerWorkspaceTaskCompleteResponse,
    OwnerWorkspaceTaskCreate,
    OwnerWorkspaceTaskMessageLink,
    OwnerWorkspaceTaskResponse,
    OwnerWorkspaceTaskUpdate,
)

router = APIRouter()


def _digest_filters(q, assignee_id: Optional[int], project_id: Optional[int]):
    if assignee_id is not None:
        q = q.filter(OwnerWorkspaceTask.assignee_id == assignee_id)
    if project_id is not None:
        q = q.filter(OwnerWorkspaceTask.project_id == project_id)
    return q


def _log_audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    action_type: str,
    author_id: Optional[int],
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
) -> None:
    db.add(
        OwnerWorkspaceAuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action_type=action_type,
            old_value=old_value,
            new_value=new_value,
            author_id=author_id,
        )
    )


def _project_to_response(db: Session, project: OwnerWorkspaceProject) -> OwnerWorkspaceProjectResponse:
    participants = db.query(OwnerWorkspaceProjectParticipant).filter(
        OwnerWorkspaceProjectParticipant.project_id == project.id
    ).all()
    active_tasks_count = db.query(OwnerWorkspaceTask).filter(
        OwnerWorkspaceTask.project_id == project.id,
        OwnerWorkspaceTask.status.in_(["new", "in_progress", "waiting"]),
    ).count()
    total_tasks_count = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.project_id == project.id).count()
    completed_tasks_count = db.query(OwnerWorkspaceTask).filter(
        OwnerWorkspaceTask.project_id == project.id,
        OwnerWorkspaceTask.status == "completed",
    ).count()
    now = datetime.now(timezone.utc)
    overdue_tasks_count = db.query(OwnerWorkspaceTask).filter(
        OwnerWorkspaceTask.project_id == project.id,
        OwnerWorkspaceTask.deadline_at.isnot(None),
        OwnerWorkspaceTask.deadline_at < now,
        OwnerWorkspaceTask.status.in_(["new", "in_progress", "waiting"]),
    ).count()
    contacts_count = db.query(OwnerWorkspaceProjectContact).filter(
        OwnerWorkspaceProjectContact.project_id == project.id
    ).count()
    subprojects_count = db.query(OwnerWorkspaceProject).filter(
        OwnerWorkspaceProject.parent_project_id == project.id
    ).count()
    return OwnerWorkspaceProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        owner_id=project.owner_id,
        parent_project_id=project.parent_project_id,
        participants=[p.user_id for p in participants],
        active_tasks_count=active_tasks_count,
        total_tasks_count=total_tasks_count,
        completed_tasks_count=completed_tasks_count,
        overdue_tasks_count=overdue_tasks_count,
        contacts_count=contacts_count,
        subprojects_count=subprojects_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
        archived_at=project.archived_at,
    )


def _contact_to_response(db: Session, contact: OwnerWorkspaceContact) -> OwnerWorkspaceContactResponse:
    linked = db.query(OwnerWorkspaceProjectContact).filter(
        OwnerWorkspaceProjectContact.contact_id == contact.id
    ).all()
    active_tasks_count = db.query(OwnerWorkspaceTask).filter(
        OwnerWorkspaceTask.contact_id == contact.id,
        OwnerWorkspaceTask.status.in_(["new", "in_progress", "waiting"]),
    ).count()
    return OwnerWorkspaceContactResponse(
        id=contact.id,
        full_name=contact.full_name,
        phone=contact.phone,
        email=contact.email,
        company=contact.company,
        position=contact.position,
        tags=contact.tags,
        comment=contact.comment,
        source=contact.source,
        linked_project_ids=[x.project_id for x in linked],
        active_tasks_count=active_tasks_count,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


def _task_to_response(db: Session, task: OwnerWorkspaceTask) -> OwnerWorkspaceTaskResponse:
    linked = db.query(OwnerWorkspaceTaskMessage).filter(OwnerWorkspaceTaskMessage.task_id == task.id).all()
    return OwnerWorkspaceTaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        deadline_at=task.deadline_at,
        start_at=task.start_at,
        completed_at=task.completed_at,
        assignee_id=task.assignee_id,
        creator_id=task.creator_id,
        project_id=task.project_id,
        contact_id=task.contact_id,
        linked_message_ids=[x.message_id for x in linked],
        tags=task.tags,
        checklist=task.checklist,
        attachments=task.attachments,
        previous_task_id=task.previous_task_id,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _message_to_response(db: Session, message: OwnerWorkspaceMessage) -> OwnerWorkspaceMessageResponse:
    links = db.query(OwnerWorkspaceTaskMessage).filter(OwnerWorkspaceTaskMessage.message_id == message.id).all()
    return OwnerWorkspaceMessageResponse(
        id=message.id,
        contact_id=message.contact_id,
        external_chat_id=message.external_chat_id,
        external_message_id=message.external_message_id,
        direction=message.direction,
        text=message.text,
        attachments=message.attachments,
        sent_at=message.sent_at,
        received_at=message.received_at,
        linked_task_ids=[x.task_id for x in links],
        created_at=message.created_at,
    )


@router.get("/projects", response_model=List[OwnerWorkspaceProjectResponse])
async def list_projects(
    status_filter: Optional[str] = Query(None),
    parent_project_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    owner_id: Optional[int] = Query(None),
    has_overdue_tasks: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    q = db.query(OwnerWorkspaceProject)
    if status_filter:
        q = q.filter(OwnerWorkspaceProject.status == status_filter)
    if parent_project_id is not None:
        q = q.filter(OwnerWorkspaceProject.parent_project_id == parent_project_id)
    if owner_id is not None:
        q = q.filter(OwnerWorkspaceProject.owner_id == owner_id)
    if has_overdue_tasks:
        now = datetime.now(timezone.utc)
        active_statuses = ("new", "in_progress", "waiting")
        overdue_exists = exists().where(
            OwnerWorkspaceTask.project_id == OwnerWorkspaceProject.id,
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
            OwnerWorkspaceTask.status.in_(active_statuses),
        )
        q = q.filter(overdue_exists)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(OwnerWorkspaceProject.name.ilike(like), OwnerWorkspaceProject.description.ilike(like)))
    rows = q.order_by(OwnerWorkspaceProject.created_at.desc()).all()
    return [_project_to_response(db, row) for row in rows]


@router.post("/projects", response_model=OwnerWorkspaceProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: OwnerWorkspaceProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = OwnerWorkspaceProject(
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        status=payload.status or "active",
        owner_id=payload.owner_id or current_user.id,
        parent_project_id=payload.parent_project_id,
    )
    db.add(row)
    db.flush()
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="create",
        author_id=current_user.id,
        new_value={"name": row.name, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _project_to_response(db, row)


@router.get("/projects/{project_id}", response_model=OwnerWorkspaceProjectResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_response(db, row)


@router.patch("/projects/{project_id}", response_model=OwnerWorkspaceProjectResponse)
async def update_project(
    project_id: int,
    payload: OwnerWorkspaceProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    old = {"name": row.name, "status": row.status, "owner_id": row.owner_id, "parent_project_id": row.parent_project_id}
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    if row.status == "archived" and row.archived_at is None:
        row.archived_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="update",
        author_id=current_user.id,
        old_value=old,
        new_value=data,
    )
    db.commit()
    db.refresh(row)
    return _project_to_response(db, row)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    row.status = "archived"
    row.archived_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="archive",
        author_id=current_user.id,
    )
    db.commit()
    return None


@router.post("/projects/{project_id}/participants", status_code=status.HTTP_204_NO_CONTENT)
async def add_project_participant(
    project_id: int,
    payload: OwnerWorkspaceProjectParticipantAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    project = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    exists = db.query(OwnerWorkspaceProjectParticipant).filter(
        OwnerWorkspaceProjectParticipant.project_id == project_id,
        OwnerWorkspaceProjectParticipant.user_id == payload.user_id,
    ).first()
    if not exists:
        db.add(OwnerWorkspaceProjectParticipant(project_id=project_id, user_id=payload.user_id))
        db.commit()
    return None


@router.delete("/projects/{project_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_participant(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceProjectParticipant).filter(
        OwnerWorkspaceProjectParticipant.project_id == project_id,
        OwnerWorkspaceProjectParticipant.user_id == user_id,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return None


@router.post("/projects/{project_id}/contacts", status_code=status.HTTP_204_NO_CONTENT)
async def add_contact_to_project(
    project_id: int,
    payload: OwnerWorkspaceProjectContactAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    project = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    contact = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == payload.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    exists = db.query(OwnerWorkspaceProjectContact).filter(
        OwnerWorkspaceProjectContact.project_id == project_id,
        OwnerWorkspaceProjectContact.contact_id == payload.contact_id,
    ).first()
    if not exists:
        db.add(OwnerWorkspaceProjectContact(project_id=project_id, contact_id=payload.contact_id))
        db.commit()
    return None


@router.delete("/projects/{project_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_contact_from_project(
    project_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceProjectContact).filter(
        OwnerWorkspaceProjectContact.project_id == project_id,
        OwnerWorkspaceProjectContact.contact_id == contact_id,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return None


@router.get("/contacts", response_model=List[OwnerWorkspaceContactResponse])
async def list_contacts(
    search: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    active_tasks_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    q = db.query(OwnerWorkspaceContact)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                OwnerWorkspaceContact.full_name.ilike(like),
                OwnerWorkspaceContact.phone.ilike(like),
                OwnerWorkspaceContact.company.ilike(like),
            )
        )
    if active_tasks_only:
        active_statuses = ("new", "in_progress", "waiting")
        at_exists = exists().where(
            OwnerWorkspaceTask.contact_id == OwnerWorkspaceContact.id,
            OwnerWorkspaceTask.status.in_(active_statuses),
        )
        q = q.filter(at_exists)
    rows = q.order_by(OwnerWorkspaceContact.created_at.desc()).all()
    if project_id is not None:
        linked_ids = {
            x.contact_id
            for x in db.query(OwnerWorkspaceProjectContact).filter(
                OwnerWorkspaceProjectContact.project_id == project_id
            ).all()
        }
        rows = [r for r in rows if r.id in linked_ids]
    return [_contact_to_response(db, row) for row in rows]


@router.post("/contacts", response_model=OwnerWorkspaceContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: OwnerWorkspaceContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = OwnerWorkspaceContact(
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        email=payload.email,
        company=payload.company,
        position=payload.position,
        tags=payload.tags,
        comment=payload.comment,
        source=payload.source,
    )
    db.add(row)
    db.flush()
    for project_id in payload.project_ids or []:
        exists = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
        if exists:
            db.add(OwnerWorkspaceProjectContact(project_id=project_id, contact_id=row.id))
    _log_audit(
        db,
        entity_type="contact",
        entity_id=row.id,
        action_type="create",
        author_id=current_user.id,
        new_value={"full_name": row.full_name, "phone": row.phone},
    )
    db.commit()
    db.refresh(row)
    return _contact_to_response(db, row)


@router.get("/contacts/{contact_id}", response_model=OwnerWorkspaceContactResponse)
async def get_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == contact_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _contact_to_response(db, row)


@router.patch("/contacts/{contact_id}", response_model=OwnerWorkspaceContactResponse)
async def update_contact(
    contact_id: int,
    payload: OwnerWorkspaceContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == contact_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    old = {"full_name": row.full_name, "phone": row.phone}
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    _log_audit(
        db,
        entity_type="contact",
        entity_id=row.id,
        action_type="update",
        author_id=current_user.id,
        old_value=old,
        new_value=data,
    )
    db.commit()
    db.refresh(row)
    return _contact_to_response(db, row)


@router.get("/contacts/{contact_id}/tasks", response_model=List[OwnerWorkspaceTaskResponse])
async def get_contact_tasks(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    rows = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.contact_id == contact_id).order_by(
        OwnerWorkspaceTask.created_at.desc()
    ).all()
    return [_task_to_response(db, row) for row in rows]


@router.get("/contacts/{contact_id}/messages", response_model=List[OwnerWorkspaceMessageResponse])
async def get_contact_messages(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    rows = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.contact_id == contact_id).order_by(
        OwnerWorkspaceMessage.created_at.desc()
    ).all()
    return [_message_to_response(db, row) for row in rows]


@router.get("/tasks", response_model=List[OwnerWorkspaceTaskResponse])
async def list_tasks(
    project_id: Optional[int] = Query(None),
    contact_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    active_only: bool = Query(False),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None, description="created_at|updated_at|deadline_at|title|priority"),
    sort_dir: Optional[str] = Query(None, description="asc|desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    q = db.query(OwnerWorkspaceTask)
    if project_id is not None:
        q = q.filter(OwnerWorkspaceTask.project_id == project_id)
    if contact_id is not None:
        q = q.filter(OwnerWorkspaceTask.contact_id == contact_id)
    if status_filter:
        q = q.filter(OwnerWorkspaceTask.status == status_filter)
    if priority:
        q = q.filter(OwnerWorkspaceTask.priority == priority)
    if assignee_id is not None:
        q = q.filter(OwnerWorkspaceTask.assignee_id == assignee_id)
    if overdue_only:
        now = datetime.now(timezone.utc)
        q = q.filter(
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
            OwnerWorkspaceTask.status.notin_(["completed", "cancelled"]),
        )
    if active_only:
        q = q.filter(OwnerWorkspaceTask.status.in_(["new", "in_progress", "waiting"]))
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(OwnerWorkspaceTask.title.ilike(like), OwnerWorkspaceTask.description.ilike(like)))

    sb, descending = normalize_task_sort_params(sort_by, sort_dir)
    prio_expr = case(
        (OwnerWorkspaceTask.priority == "low", 1),
        (OwnerWorkspaceTask.priority == "medium", 2),
        (OwnerWorkspaceTask.priority == "high", 3),
        (OwnerWorkspaceTask.priority == "critical", 4),
        else_=99,
    )
    if sb == "created_at":
        sort_col = OwnerWorkspaceTask.created_at
    elif sb == "updated_at":
        sort_col = OwnerWorkspaceTask.updated_at
    elif sb == "deadline_at":
        sort_col = OwnerWorkspaceTask.deadline_at
    elif sb == "title":
        sort_col = OwnerWorkspaceTask.title
    else:
        sort_col = prio_expr

    if sb == "deadline_at":
        order_expr = nullslast(desc(sort_col) if descending else asc(sort_col))
    else:
        order_expr = desc(sort_col) if descending else asc(sort_col)
    rows = q.order_by(order_expr).all()
    return [_task_to_response(db, row) for row in rows]


@router.post("/tasks", response_model=OwnerWorkspaceTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: OwnerWorkspaceTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = OwnerWorkspaceTask(
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        status=payload.status or "new",
        priority=payload.priority or "medium",
        deadline_at=payload.deadline_at,
        start_at=payload.start_at,
        assignee_id=payload.assignee_id,
        creator_id=current_user.id,
        project_id=payload.project_id,
        contact_id=payload.contact_id,
        tags=payload.tags,
        checklist=payload.checklist,
        attachments=payload.attachments,
        previous_task_id=payload.previous_task_id,
    )
    if row.status == "completed":
        row.completed_at = datetime.now(timezone.utc)
    db.add(row)
    db.flush()
    for message_id in payload.linked_message_ids or []:
        exists = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
        if exists:
            db.add(OwnerWorkspaceTaskMessage(task_id=row.id, message_id=message_id))
    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="create",
        author_id=current_user.id,
        new_value={"title": row.title, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.get("/tasks/{task_id}", response_model=OwnerWorkspaceTaskResponse)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(db, row)


@router.patch("/tasks/{task_id}", response_model=OwnerWorkspaceTaskResponse)
async def update_task(
    task_id: int,
    payload: OwnerWorkspaceTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    data = payload.model_dump(exclude_unset=True)
    if row.status in ("completed", "cancelled") and current_user.role.value not in ("admin", "owner"):
        editable_fields = {"status"}
        if any(k not in editable_fields for k in data.keys()):
            raise HTTPException(status_code=400, detail="Completed/cancelled task can be edited only after status change")

    old = {"status": row.status, "assignee_id": row.assignee_id, "priority": row.priority}
    for k, v in data.items():
        setattr(row, k, v)
    if "status" in data:
        if row.status == "completed" and row.completed_at is None:
            row.completed_at = datetime.now(timezone.utc)
        elif row.status != "completed":
            row.completed_at = None

    if "linked_message_ids" in data:
        db.query(OwnerWorkspaceTaskMessage).filter(OwnerWorkspaceTaskMessage.task_id == task_id).delete()
        for message_id in data.get("linked_message_ids") or []:
            exists = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
            if exists:
                db.add(OwnerWorkspaceTaskMessage(task_id=task_id, message_id=message_id))

    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="update",
        author_id=current_user.id,
        old_value=old,
        new_value=data,
    )
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.post("/tasks/bulk-update")
async def bulk_update_tasks(
    payload: OwnerWorkspaceTaskBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    data = payload.model_dump(exclude_unset=True)
    task_ids = data.pop("task_ids", [])
    if not data:
        raise HTTPException(status_code=400, detail="Укажите status, assignee_id и/или priority")
    updated = 0
    for tid in task_ids:
        row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == tid).first()
        if not row:
            continue
        if row.status in ("completed", "cancelled") and current_user.role.value not in ("admin", "owner"):
            editable_fields = {"status"}
            if any(k not in editable_fields for k in data.keys()):
                continue
        old = {"status": row.status, "assignee_id": row.assignee_id, "priority": row.priority}
        for k, v in data.items():
            setattr(row, k, v)
        if "status" in data:
            if row.status == "completed" and row.completed_at is None:
                row.completed_at = datetime.now(timezone.utc)
            elif row.status != "completed":
                row.completed_at = None
        _log_audit(
            db,
            entity_type="task",
            entity_id=row.id,
            action_type="bulk_update",
            author_id=current_user.id,
            old_value=old,
            new_value=data,
        )
        updated += 1
    db.commit()
    return {"updated": updated}


@router.post("/tasks/{task_id}/complete", response_model=OwnerWorkspaceTaskCompleteResponse)
async def complete_task(
    task_id: int,
    payload: OwnerWorkspaceTaskCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="complete",
        author_id=current_user.id,
    )

    new_task_row: Optional[OwnerWorkspaceTask] = None
    if payload.action == "close_and_create_next":
        next_data = payload.next_task
        if next_data is None:
            next_data = OwnerWorkspaceTaskCreate(
                title=f"Next: {row.title}",
                description=None,
                status="new",
                priority=row.priority,
                deadline_at=None,
                start_at=None,
                assignee_id=row.assignee_id,
                project_id=row.project_id,
                contact_id=row.contact_id,
                tags=row.tags,
                checklist=None,
                attachments=None,
                linked_message_ids=[m.message_id for m in db.query(OwnerWorkspaceTaskMessage).filter(OwnerWorkspaceTaskMessage.task_id == row.id).all()],
                previous_task_id=row.id,
            )
        new_task_row = OwnerWorkspaceTask(
            title=next_data.title.strip(),
            description=(next_data.description or "").strip() or None,
            status=next_data.status or "new",
            priority=next_data.priority or row.priority,
            deadline_at=next_data.deadline_at,
            start_at=next_data.start_at,
            assignee_id=next_data.assignee_id if next_data.assignee_id is not None else row.assignee_id,
            creator_id=current_user.id,
            project_id=next_data.project_id if next_data.project_id is not None else row.project_id,
            contact_id=next_data.contact_id if next_data.contact_id is not None else row.contact_id,
            tags=next_data.tags if next_data.tags is not None else row.tags,
            checklist=next_data.checklist,
            attachments=next_data.attachments,
            previous_task_id=row.id,
        )
        db.add(new_task_row)
        db.flush()
        for message_id in next_data.linked_message_ids or []:
            exists = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
            if exists:
                db.add(OwnerWorkspaceTaskMessage(task_id=new_task_row.id, message_id=message_id))
        _log_audit(
            db,
            entity_type="task",
            entity_id=new_task_row.id,
            action_type="create_from_previous",
            author_id=current_user.id,
            new_value={"previous_task_id": row.id},
        )

    db.commit()
    db.refresh(row)
    next_resp: Optional[OwnerWorkspaceTaskResponse] = None
    if new_task_row is not None:
        db.refresh(new_task_row)
        next_resp = _task_to_response(db, new_task_row)
    return OwnerWorkspaceTaskCompleteResponse(
        completed_task=_task_to_response(db, row),
        next_task=next_resp,
    )


@router.post("/tasks/{task_id}/complete-and-create-next", response_model=OwnerWorkspaceTaskCompleteResponse)
async def complete_and_create_next(
    task_id: int,
    payload: OwnerWorkspaceTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    req = OwnerWorkspaceTaskCompleteRequest(action="close_and_create_next", next_task=payload)
    return await complete_task(task_id=task_id, payload=req, db=db, current_user=current_user)


@router.get("/tasks/{task_id}/comments", response_model=List[OwnerWorkspaceTaskCommentResponse])
async def list_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    exists = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Task not found")
    rows = (
        db.query(OwnerWorkspaceTaskComment)
        .filter(OwnerWorkspaceTaskComment.task_id == task_id)
        .order_by(OwnerWorkspaceTaskComment.created_at.asc())
        .all()
    )
    return [OwnerWorkspaceTaskCommentResponse.model_validate(x) for x in rows]


@router.post("/tasks/{task_id}/comments", response_model=OwnerWorkspaceTaskCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_task_comment(
    task_id: int,
    payload: OwnerWorkspaceTaskCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    exists = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Task not found")
    row = OwnerWorkspaceTaskComment(task_id=task_id, author_id=current_user.id, text=payload.text.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    return OwnerWorkspaceTaskCommentResponse.model_validate(row)


@router.post("/tasks/{task_id}/link-message", status_code=status.HTTP_204_NO_CONTENT)
async def link_message_to_task(
    task_id: int,
    payload: OwnerWorkspaceTaskMessageLink,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == payload.message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    exists = db.query(OwnerWorkspaceTaskMessage).filter(
        OwnerWorkspaceTaskMessage.task_id == task_id,
        OwnerWorkspaceTaskMessage.message_id == payload.message_id,
    ).first()
    if not exists:
        db.add(OwnerWorkspaceTaskMessage(task_id=task_id, message_id=payload.message_id))
        db.commit()
    return None


@router.delete("/tasks/{task_id}/link-message/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_message_from_task(
    task_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    link = db.query(OwnerWorkspaceTaskMessage).filter(
        OwnerWorkspaceTaskMessage.task_id == task_id,
        OwnerWorkspaceTaskMessage.message_id == message_id,
    ).first()
    if link:
        db.delete(link)
        db.commit()
    return None


@router.get("/messages", response_model=List[OwnerWorkspaceMessageResponse])
async def list_messages(
    contact_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    q = db.query(OwnerWorkspaceMessage)
    if contact_id is not None:
        q = q.filter(OwnerWorkspaceMessage.contact_id == contact_id)
    rows = q.order_by(OwnerWorkspaceMessage.created_at.desc()).all()
    return [_message_to_response(db, row) for row in rows]


@router.get("/messages/conversations", response_model=List[OwnerWorkspaceConversationItem])
async def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    rows = (
        db.query(
            OwnerWorkspaceContact.id.label("contact_id"),
            OwnerWorkspaceContact.full_name.label("contact_name"),
            func.max(OwnerWorkspaceMessage.created_at).label("last_message_at"),
        )
        .join(OwnerWorkspaceMessage, OwnerWorkspaceMessage.contact_id == OwnerWorkspaceContact.id)
        .group_by(OwnerWorkspaceContact.id, OwnerWorkspaceContact.full_name)
        .order_by(func.max(OwnerWorkspaceMessage.created_at).desc())
        .all()
    )
    out: List[OwnerWorkspaceConversationItem] = []
    for row in rows:
        last_message = (
            db.query(OwnerWorkspaceMessage)
            .filter(OwnerWorkspaceMessage.contact_id == row.contact_id)
            .order_by(OwnerWorkspaceMessage.created_at.desc())
            .first()
        )
        out.append(
            OwnerWorkspaceConversationItem(
                contact_id=row.contact_id,
                contact_name=row.contact_name,
                last_message_at=row.last_message_at,
                last_message_text=getattr(last_message, "text", None),
                unread_count=0,
            )
        )
    return out


@router.get("/contacts/{contact_id}/conversation", response_model=List[OwnerWorkspaceMessageResponse])
async def contact_conversation(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    return await get_contact_messages(contact_id=contact_id, db=db, current_user=current_user)


@router.post("/messages/sync-from-max")
async def sync_max_messages_into_owner_workspace(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """
    Импорт исходящих сообщений MAX (таблица max_messages) в переписку owner workspace.
    Сопоставление по нормализованному телефону контакта. Дубликаты пропускаются (external_message_id = max:<uuid>).
    """
    imported, skipped = run_owner_workspace_max_sync(db, limit=limit)
    return {"imported": imported, "skipped": skipped}


@router.post("/messages", response_model=OwnerWorkspaceMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: OwnerWorkspaceMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    contact = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == payload.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    row = OwnerWorkspaceMessage(
        contact_id=payload.contact_id,
        external_chat_id=payload.external_chat_id,
        external_message_id=payload.external_message_id,
        direction=payload.direction,
        text=payload.text.strip(),
        attachments=payload.attachments,
        sent_at=payload.sent_at,
        received_at=payload.received_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _message_to_response(db, row)


@router.post("/messages/{message_id}/create-task", response_model=OwnerWorkspaceTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task_from_message(
    message_id: int,
    payload: OwnerWorkspaceMessageCreateTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    row = OwnerWorkspaceTask(
        title=payload.title.strip(),
        description=(payload.description or message.text or "").strip() or None,
        status="new",
        priority=payload.priority or "medium",
        deadline_at=payload.deadline_at,
        assignee_id=payload.assignee_id,
        creator_id=current_user.id,
        project_id=payload.project_id,
        contact_id=message.contact_id,
    )
    db.add(row)
    db.flush()
    db.add(OwnerWorkspaceTaskMessage(task_id=row.id, message_id=message_id))
    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="create_from_message",
        author_id=current_user.id,
        new_value={"message_id": message_id},
    )
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.post("/messages/{message_id}/link-task", status_code=status.HTTP_204_NO_CONTENT)
async def link_message_with_task(
    message_id: int,
    payload: OwnerWorkspaceMessageLinkTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == payload.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    exists = db.query(OwnerWorkspaceTaskMessage).filter(
        OwnerWorkspaceTaskMessage.task_id == payload.task_id,
        OwnerWorkspaceTaskMessage.message_id == message_id,
    ).first()
    if not exists:
        db.add(OwnerWorkspaceTaskMessage(task_id=payload.task_id, message_id=message_id))
        db.commit()
    return None


@router.get("/notifications", response_model=OwnerWorkspaceNotificationsEnvelope)
async def list_owner_workspace_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    due_soon_hours: int = Query(24, ge=1, le=336, description="Окно «скоро дедлайн» при синхронизации уведомлений"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """
    In-app уведомления по дедлайнам для текущего пользователя (как исполнителя).
    Перед выдачей списка синхронизирует записи по просроченным и скорым задачам.
    """
    refresh_deadline_notifications_for_user(db, current_user.id, due_soon_hours=due_soon_hours)
    q = db.query(OwnerWorkspaceNotification).filter(OwnerWorkspaceNotification.user_id == current_user.id)
    if unread_only:
        q = q.filter(OwnerWorkspaceNotification.read_at.is_(None))
    rows = q.order_by(OwnerWorkspaceNotification.created_at.desc()).limit(limit).all()
    unread = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(
            OwnerWorkspaceNotification.user_id == current_user.id,
            OwnerWorkspaceNotification.read_at.is_(None),
        )
        .scalar()
        or 0
    )
    return OwnerWorkspaceNotificationsEnvelope(
        items=[OwnerWorkspaceNotificationResponse.model_validate(x) for x in rows],
        unread_count=int(unread),
    )


@router.patch("/notifications/{notification_id}/read", response_model=OwnerWorkspaceNotificationResponse)
async def mark_owner_workspace_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    n = (
        db.query(OwnerWorkspaceNotification)
        .filter(
            OwnerWorkspaceNotification.id == notification_id,
            OwnerWorkspaceNotification.user_id == current_user.id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(n)
    return OwnerWorkspaceNotificationResponse.model_validate(n)


@router.get("/digest", response_model=OwnerWorkspaceDigestResponse)
async def owner_workspace_digest(
    due_within_hours: int = Query(48, ge=1, le=336),
    assignee_id: Optional[int] = Query(None, description="Только задачи этого исполнителя"),
    project_id: Optional[int] = Query(None, description="Только задачи этого проекта"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """Сводка для уведомлений: просроченные и задачи с дедлайном в ближайшие N часов."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=due_within_hours)
    active = ["new", "in_progress", "waiting"]
    overdue_q = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
            OwnerWorkspaceTask.status.in_(active),
        )
    )
    overdue_q = _digest_filters(overdue_q, assignee_id, project_id)
    overdue_tasks = overdue_q.order_by(OwnerWorkspaceTask.deadline_at.asc()).limit(25).all()
    overdue_count_q = (
        db.query(func.count(OwnerWorkspaceTask.id))
        .filter(
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
            OwnerWorkspaceTask.status.in_(active),
        )
    )
    overdue_count_q = _digest_filters(overdue_count_q, assignee_id, project_id)
    overdue_count = overdue_count_q.scalar() or 0
    due_soon_q = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at >= now,
            OwnerWorkspaceTask.deadline_at <= horizon,
            OwnerWorkspaceTask.status.in_(active),
        )
    )
    due_soon_q = _digest_filters(due_soon_q, assignee_id, project_id)
    due_soon_tasks = due_soon_q.order_by(OwnerWorkspaceTask.deadline_at.asc()).limit(25).all()
    return OwnerWorkspaceDigestResponse(
        overdue_count=int(overdue_count),
        overdue_tasks=[_task_to_response(db, t) for t in overdue_tasks],
        due_soon_tasks=[_task_to_response(db, t) for t in due_soon_tasks],
    )


@router.get("/search", response_model=OwnerWorkspaceSearchResponse)
async def owner_workspace_unified_search(
    q: str = Query("", max_length=200),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    """Единый поиск по проектам, контактам и задачам владельческого задачника."""
    term = (q or "").strip()
    if len(term) < 2:
        return OwnerWorkspaceSearchResponse(projects=[], contacts=[], tasks=[], messages=[])
    like = f"%{term}%"
    prow = (
        db.query(OwnerWorkspaceProject)
        .filter(
            or_(
                OwnerWorkspaceProject.name.ilike(like),
                OwnerWorkspaceProject.description.ilike(like),
            )
        )
        .order_by(OwnerWorkspaceProject.created_at.desc())
        .limit(limit)
        .all()
    )
    projects = [OwnerWorkspaceSearchProjectHit(id=r.id, name=r.name, status=r.status) for r in prow]
    crow = (
        db.query(OwnerWorkspaceContact)
        .filter(
            or_(
                OwnerWorkspaceContact.full_name.ilike(like),
                OwnerWorkspaceContact.phone.ilike(like),
                OwnerWorkspaceContact.company.ilike(like),
                func.coalesce(OwnerWorkspaceContact.comment, "").ilike(like),
            )
        )
        .order_by(OwnerWorkspaceContact.created_at.desc())
        .limit(limit)
        .all()
    )
    contacts = [
        OwnerWorkspaceSearchContactHit(id=r.id, full_name=r.full_name, phone=r.phone or "") for r in crow
    ]
    trow = (
        db.query(OwnerWorkspaceTask)
        .filter(
            or_(
                OwnerWorkspaceTask.title.ilike(like),
                OwnerWorkspaceTask.description.ilike(like),
                cast(OwnerWorkspaceTask.tags, String).ilike(like),
            )
        )
        .order_by(OwnerWorkspaceTask.created_at.desc())
        .limit(limit)
        .all()
    )
    tasks = [
        OwnerWorkspaceSearchTaskHit(
            id=r.id,
            title=r.title,
            status=r.status,
            deadline_at=r.deadline_at,
            project_id=r.project_id,
            contact_id=r.contact_id,
        )
        for r in trow
    ]
    mrows = (
        db.query(OwnerWorkspaceMessage)
        .filter(OwnerWorkspaceMessage.text.ilike(like))
        .order_by(OwnerWorkspaceMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    messages: List[OwnerWorkspaceSearchMessageHit] = []
    for m in mrows:
        cname = None
        if m.contact:
            cname = m.contact.full_name
        else:
            cc = (
                db.query(OwnerWorkspaceContact)
                .filter(OwnerWorkspaceContact.id == m.contact_id)
                .first()
            )
            if cc:
                cname = cc.full_name
        raw = m.text or ""
        preview = raw if len(raw) <= 240 else raw[:237] + "..."
        messages.append(
            OwnerWorkspaceSearchMessageHit(
                id=m.id,
                contact_id=m.contact_id,
                contact_name=cname,
                direction=m.direction,
                text_preview=preview,
                created_at=m.created_at,
            )
        )
    return OwnerWorkspaceSearchResponse(projects=projects, contacts=contacts, tasks=tasks, messages=messages)


@router.get("/history", response_model=List[OwnerWorkspaceAuditLogResponse])
async def list_history(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    q = db.query(OwnerWorkspaceAuditLog)
    if entity_type:
        q = q.filter(OwnerWorkspaceAuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(OwnerWorkspaceAuditLog.entity_id == entity_id)
    rows = q.order_by(OwnerWorkspaceAuditLog.created_at.desc()).limit(300).all()
    return [OwnerWorkspaceAuditLogResponse.model_validate(x) for x in rows]
