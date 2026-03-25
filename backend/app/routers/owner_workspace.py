from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, asc, case, cast, desc, exists, func, nullslast, or_
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.services.owner_workspace_access import (
    OWNER_WORKSPACE_API_ROLES,
    OwnerWorkspaceAccessContext,
    audit_history_allowed,
    assert_full_workspace,
    build_owner_workspace_access_context,
    can_archive_project,
    can_bulk_update_tasks,
    can_complete_task,
    can_edit_contact_content,
    can_update_contact_content,
    can_change_project_participant_roles,
    can_edit_project_meta,
    can_edit_project_content,
    can_link_task_messages,
    can_manage_project_contacts,
    can_update_task_content,
    can_manage_project_team,
    contact_visible,
    filter_tasks_query,
    get_owner_workspace_permission_policy,
    is_project_manager,
    is_project_owner,
    is_project_participant,
    project_visible,
    project_participant_record,
    task_visible,
)
from app.services.owner_workspace_max_sync import sync_max_messages_into_owner_workspace as run_owner_workspace_max_sync
from app.services.owner_workspace_notifications import (
    get_web_push_public_key,
    notify_incoming_contact_message,
    notify_task_assigned,
    notify_task_comment_added,
    notify_task_comment_mentions,
    notify_task_updated,
    refresh_deadline_notifications_for_user,
)
from app.services.owner_workspace_preferences import get_preferences_for_user, merge_preferences_for_user
from app.services.owner_workspace_task_order import normalize_task_sort_params
from app.models import (
    OwnerWorkspaceAuditLog,
    OwnerWorkspaceContact,
    OwnerWorkspaceConversationRead,
    OwnerWorkspaceMessage,
    OwnerWorkspaceNotification,
    OwnerWorkspaceProject,
    OwnerWorkspaceProjectContact,
    OwnerWorkspaceProjectParticipant,
    OwnerWorkspaceTask,
    OwnerWorkspaceTaskComment,
    OwnerWorkspaceTaskMessage,
    OwnerWorkspaceWebPushSubscription,
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
    OwnerWorkspaceWebPushStatusResponse,
    OwnerWorkspaceWebPushSubscriptionDelete,
    OwnerWorkspaceWebPushSubscriptionUpsert,
    OwnerWorkspaceUserPreferencesPatch,
    OwnerWorkspaceUserPreferencesResponse,
    OwnerWorkspaceProjectContactAdd,
    OwnerWorkspaceProjectCreate,
    OwnerWorkspaceProjectParticipantAdd,
    OwnerWorkspaceProjectParticipantRolePatch,
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
    OwnerWorkspaceTaskListResponse,
    OwnerWorkspaceTaskStatusCountsResponse,
    OwnerWorkspaceTasksAnalyticsOverview,
    OwnerWorkspaceTaskMessageLink,
    OwnerWorkspaceTaskResponse,
    OwnerWorkspaceTaskUpdate,
)

router = APIRouter()


async def get_owner_workspace_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(OWNER_WORKSPACE_API_ROLES)),
) -> OwnerWorkspaceAccessContext:
    return build_owner_workspace_access_context(db, current_user)


def _batch_unread_incoming_message_counts(
    db: Session, user_id: int, contact_ids: List[int]
) -> Dict[int, int]:
    """
    Входящие с created_at после эффективного курсора чтения.
    Если строки read нет — курсор = max(created_at) по всем сообщениям контакта (релиз без ложных «тысяч непрочитанных»).
    """
    if not contact_ids:
        return {}
    Read = OwnerWorkspaceConversationRead
    max_per_contact = (
        db.query(
            OwnerWorkspaceMessage.contact_id.label("cid"),
            func.max(OwnerWorkspaceMessage.created_at).label("mx"),
        )
        .filter(OwnerWorkspaceMessage.contact_id.in_(contact_ids))
        .group_by(OwnerWorkspaceMessage.contact_id)
        .subquery()
    )
    mpc = max_per_contact.alias("mpc")
    effective_read = func.coalesce(Read.last_read_at, mpc.c.mx)
    q = (
        db.query(
            OwnerWorkspaceMessage.contact_id,
            func.count(OwnerWorkspaceMessage.id),
        )
        .join(mpc, mpc.c.cid == OwnerWorkspaceMessage.contact_id)
        .outerjoin(
            Read,
            (Read.contact_id == OwnerWorkspaceMessage.contact_id) & (Read.user_id == user_id),
        )
        .filter(
            OwnerWorkspaceMessage.contact_id.in_(contact_ids),
            OwnerWorkspaceMessage.direction == "incoming",
            OwnerWorkspaceMessage.created_at > effective_read,
        )
        .group_by(OwnerWorkspaceMessage.contact_id)
    )
    return {int(r[0]): int(r[1]) for r in q.all()}


def _mark_conversation_read_for_user(db: Session, user_id: int, contact_id: int) -> None:
    """После просмотра ленты: курсор = max(created_at) по всем сообщениям контакта."""
    max_ts = (
        db.query(func.max(OwnerWorkspaceMessage.created_at))
        .filter(OwnerWorkspaceMessage.contact_id == contact_id)
        .scalar()
    )
    if max_ts is None:
        return
    row = (
        db.query(OwnerWorkspaceConversationRead)
        .filter(
            OwnerWorkspaceConversationRead.user_id == user_id,
            OwnerWorkspaceConversationRead.contact_id == contact_id,
        )
        .first()
    )
    if row is None:
        db.add(
            OwnerWorkspaceConversationRead(
                user_id=user_id,
                contact_id=contact_id,
                last_read_at=max_ts,
            )
        )
    elif max_ts > row.last_read_at:
        row.last_read_at = max_ts
    db.commit()


def _digest_filters(q, assignee_id: Optional[int], project_id: Optional[int]):
    if assignee_id is not None:
        q = q.filter(OwnerWorkspaceTask.assignee_id == assignee_id)
    if project_id is not None:
        q = q.filter(OwnerWorkspaceTask.project_id == project_id)
    return q


def _assert_valid_project_parent(
    db: Session,
    ctx: OwnerWorkspaceAccessContext,
    project_id: int,
    new_parent_id: Optional[int],
) -> None:
    """Запрет циклов: нельзя сделать родителем сам проект или любого его потомка."""
    if new_parent_id is None:
        return
    if new_parent_id == project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Проект не может быть родителем самому себе")
    parent_row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == new_parent_id).first()
    if not parent_row or not project_visible(ctx, new_parent_id):
        raise HTTPException(status_code=404, detail="Родительский проект не найден")
    cur: Optional[int] = new_parent_id
    guard = 0
    while cur is not None and guard < 10_000:
        if cur == project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя перенести проект под своего потомка (цикл в иерархии)",
            )
        prow = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == cur).first()
        if not prow:
            break
        cur = prow.parent_project_id
        guard += 1


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
    role_by_uid = {int(p.user_id): (p.role or "member").strip().lower() or "member" for p in participants}
    return OwnerWorkspaceProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        owner_id=project.owner_id,
        parent_project_id=project.parent_project_id,
        participants=[p.user_id for p in participants],
        participant_roles=role_by_uid,
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


def _max_datetimes(*values: Optional[datetime]) -> Optional[datetime]:
    vals = [v for v in values if v is not None]
    return max(vals) if vals else None


def _last_message_time_by_contact_ids(db: Session, contact_ids: List[int]) -> Dict[int, datetime]:
    if not contact_ids:
        return {}
    rows = (
        db.query(OwnerWorkspaceMessage.contact_id, func.max(OwnerWorkspaceMessage.created_at))
        .filter(OwnerWorkspaceMessage.contact_id.in_(contact_ids))
        .group_by(OwnerWorkspaceMessage.contact_id)
        .all()
    )
    out: Dict[int, datetime] = {}
    for cid, ts in rows:
        if cid is not None and ts is not None:
            out[int(cid)] = ts
    return out


def _last_task_activity_by_contact_ids(db: Session, contact_ids: List[int]) -> Dict[int, datetime]:
    if not contact_ids:
        return {}
    rows = (
        db.query(OwnerWorkspaceTask.contact_id, func.max(OwnerWorkspaceTask.updated_at))
        .filter(
            OwnerWorkspaceTask.contact_id.in_(contact_ids),
            OwnerWorkspaceTask.contact_id.isnot(None),
        )
        .group_by(OwnerWorkspaceTask.contact_id)
        .all()
    )
    return {int(cid): ts for cid, ts in rows if cid is not None and ts is not None}


def _contact_last_interaction_at(
    db: Session,
    contact: OwnerWorkspaceContact,
    *,
    message_max_by_id: Optional[Dict[int, datetime]] = None,
    task_max_by_id: Optional[Dict[int, datetime]] = None,
) -> Optional[datetime]:
    cid = contact.id
    if message_max_by_id is None:
        message_max_by_id = _last_message_time_by_contact_ids(db, [cid])
    if task_max_by_id is None:
        task_max_by_id = _last_task_activity_by_contact_ids(db, [cid])
    return _max_datetimes(
        contact.updated_at,
        message_max_by_id.get(cid),
        task_max_by_id.get(cid),
    )


def _contact_to_response(
    db: Session,
    contact: OwnerWorkspaceContact,
    *,
    message_max_by_id: Optional[Dict[int, datetime]] = None,
    task_max_by_id: Optional[Dict[int, datetime]] = None,
) -> OwnerWorkspaceContactResponse:
    linked = db.query(OwnerWorkspaceProjectContact).filter(
        OwnerWorkspaceProjectContact.contact_id == contact.id
    ).all()
    active_tasks_count = db.query(OwnerWorkspaceTask).filter(
        OwnerWorkspaceTask.contact_id == contact.id,
        OwnerWorkspaceTask.status.in_(["new", "in_progress", "waiting"]),
    ).count()
    last_interaction_at = _contact_last_interaction_at(
        db,
        contact,
        message_max_by_id=message_max_by_id,
        task_max_by_id=task_max_by_id,
    )
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
        last_interaction_at=last_interaction_at,
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


def _assert_task_write_access(db: Session, ctx: OwnerWorkspaceAccessContext, task: OwnerWorkspaceTask) -> None:
    if task.project_id is None:
        return
    if not can_edit_project_content(db, ctx, task.project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
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
    if not ctx.full:
        if not ctx.project_ids:
            return []
        q = q.filter(OwnerWorkspaceProject.id.in_(list(ctx.project_ids)))
    rows = q.order_by(OwnerWorkspaceProject.created_at.desc()).all()
    return [_project_to_response(db, row) for row in rows]


@router.post("/projects", response_model=OwnerWorkspaceProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: OwnerWorkspaceProjectCreate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if not ctx.full and not permission_policy["limited_can_create_projects"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.parent_project_id is not None and not ctx.full and not can_edit_project_content(db, ctx, payload.parent_project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для создания подпроекта")
    row = OwnerWorkspaceProject(
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        status=payload.status or "active",
        owner_id=payload.owner_id or ctx.user.id,
        parent_project_id=payload.parent_project_id,
    )
    db.add(row)
    db.flush()
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="create",
        author_id=ctx.user.id,
        new_value={"name": row.name, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _project_to_response(db, row)


@router.get("/projects/{project_id}", response_model=OwnerWorkspaceProjectResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row or not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_response(db, row)


@router.patch("/projects/{project_id}", response_model=OwnerWorkspaceProjectResponse)
async def update_project(
    project_id: int,
    payload: OwnerWorkspaceProjectUpdate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row or not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    old = {"name": row.name, "status": row.status, "owner_id": row.owner_id, "parent_project_id": row.parent_project_id}
    data = payload.model_dump(exclude_unset=True)
    if not ctx.full:
        uid = ctx.user.id
        if row.owner_id != uid:
            if not is_project_participant(db, uid, project_id):
                raise HTTPException(status_code=404, detail="Project not found")
            meta_fields = {"name", "description"}
            if any(k in meta_fields for k in data) and not can_edit_project_meta(db, ctx, project_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Недостаточно прав для изменения карточки проекта",
                )
            forbidden = {"owner_id", "parent_project_id", "status"}
            for k in data:
                if k in forbidden:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Участник может менять только название и описание проекта",
                    )
    if "parent_project_id" in data:
        _assert_valid_project_parent(db, ctx, project_id, data["parent_project_id"])
    for k, v in data.items():
        setattr(row, k, v)
    if row.status == "archived" and row.archived_at is None:
        row.archived_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="update",
        author_id=ctx.user.id,
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not row or not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_archive_project(db, ctx, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Архивировать может только владелец проекта или администратор")
    row.status = "archived"
    row.archived_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="project",
        entity_id=row.id,
        action_type="archive",
        author_id=ctx.user.id,
    )
    db.commit()
    return None


@router.post("/projects/{project_id}/participants", status_code=status.HTTP_204_NO_CONTENT)
async def add_project_participant(
    project_id: int,
    payload: OwnerWorkspaceProjectParticipantAdd,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    project = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not project or not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    permission_policy = get_owner_workspace_permission_policy(db)
    if not can_manage_project_team(db, ctx, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для управления участниками")
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    eff_role = (payload.role or "member").strip().lower()
    if eff_role not in ("member", "manager", "observer"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role must be member, manager or observer")
    uid = ctx.user.id
    is_owner = is_project_owner(db, uid, project_id)
    is_manager = is_project_manager(db, uid, project_id)
    if not ctx.full and not is_owner and is_manager:
        if eff_role == "manager" and not permission_policy["manager_can_assign_manager"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="По настройкам модуля менеджер не может назначать других менеджеров",
            )
        if eff_role == "observer" and not permission_policy["manager_can_assign_observer"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="По настройкам модуля менеджер не может назначать наблюдателей",
            )
    if eff_role == "manager" and not (ctx.full or is_owner or (is_manager and permission_policy["manager_can_assign_manager"])):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Назначать менеджеров может только владелец проекта или администратор")
    if eff_role == "observer" and not (ctx.full or is_owner or (is_manager and permission_policy["manager_can_assign_observer"])):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Назначать наблюдателей может только владелец проекта или администратор")
    exists = db.query(OwnerWorkspaceProjectParticipant).filter(
        OwnerWorkspaceProjectParticipant.project_id == project_id,
        OwnerWorkspaceProjectParticipant.user_id == payload.user_id,
    ).first()
    if not exists:
        db.add(
            OwnerWorkspaceProjectParticipant(project_id=project_id, user_id=payload.user_id, role=eff_role)
        )
        db.commit()
    return None



@router.patch("/projects/{project_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def patch_project_participant_role(
    project_id: int,
    user_id: int,
    payload: OwnerWorkspaceProjectParticipantRolePatch,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    permission_policy = get_owner_workspace_permission_policy(db)
    if not can_change_project_participant_roles(db, ctx, project_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Менять роли участников может только владелец проекта или администратор",
        )
    row = project_participant_record(db, project_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Participant not found")
    new_role = payload.role.strip().lower()
    if new_role not in ("member", "manager", "observer"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role must be member, manager or observer")
    if not ctx.full and not is_project_owner(db, ctx.user.id, project_id) and is_project_manager(db, ctx.user.id, project_id):
        if new_role == "manager" and not permission_policy["manager_can_assign_manager"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="По настройкам модуля менеджер не может назначать других менеджеров")
        if new_role == "observer" and not permission_policy["manager_can_assign_observer"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="По настройкам модуля менеджер не может назначать наблюдателей")
    row.role = new_role
    db.commit()
    return None



@router.delete("/projects/{project_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_participant(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    permission_policy = get_owner_workspace_permission_policy(db)
    if not can_manage_project_team(db, ctx, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для управления участниками")
    row = db.query(OwnerWorkspaceProjectParticipant).filter(
        OwnerWorkspaceProjectParticipant.project_id == project_id,
        OwnerWorkspaceProjectParticipant.user_id == user_id,
    ).first()
    if row:
        actor_id = ctx.user.id
        if not ctx.full and not is_project_owner(db, actor_id, project_id):
            if is_project_manager(db, actor_id, project_id):
                tgt_role = (row.role or "member").strip().lower() or "member"
                if tgt_role == "manager" and not permission_policy["manager_can_remove_manager"]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Менеджер не может исключить другого менеджера",
                    )
        db.delete(row)
        db.commit()
    return None



@router.post("/projects/{project_id}/contacts", status_code=status.HTTP_204_NO_CONTENT)
async def add_contact_to_project(
    project_id: int,
    payload: OwnerWorkspaceProjectContactAdd,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    project = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    if not project or not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    uid = ctx.user.id
    if not can_manage_project_contacts(db, ctx, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    contact = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == payload.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not ctx.full and not contact_visible(ctx, payload.contact_id):
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    uid = ctx.user.id
    if not can_manage_project_contacts(db, ctx, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if not ctx.full and not contact_visible(ctx, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
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
    tag: Optional[str] = Query(
        None,
        description="Контакт должен содержать этот тег в JSON-массиве tags (точное совпадение строки)",
    ),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if project_id is not None and not ctx.full and not project_visible(ctx, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    q = db.query(OwnerWorkspaceContact)
    if not ctx.full:
        if not ctx.contact_ids:
            return []
        q = q.filter(OwnerWorkspaceContact.id.in_(list(ctx.contact_ids)))
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
    if tag and tag.strip():
        q = q.filter(OwnerWorkspaceContact.tags.contains([tag.strip()]))
    rows = q.order_by(OwnerWorkspaceContact.created_at.desc()).all()
    if project_id is not None:
        linked_ids = {
            x.contact_id
            for x in db.query(OwnerWorkspaceProjectContact).filter(
                OwnerWorkspaceProjectContact.project_id == project_id
            ).all()
        }
        rows = [r for r in rows if r.id in linked_ids]
    ids = [r.id for r in rows]
    msg_max = _last_message_time_by_contact_ids(db, ids)
    task_max = _last_task_activity_by_contact_ids(db, ids)
    return [
        _contact_to_response(db, row, message_max_by_id=msg_max, task_max_by_id=task_max) for row in rows
    ]


@router.post("/contacts", response_model=OwnerWorkspaceContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: OwnerWorkspaceContactCreate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if not ctx.full and not permission_policy["limited_can_create_contacts"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if not ctx.full and not (payload.project_ids or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Укажите проект для привязки контакта",
        )
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
        if not exists:
            continue
        if not ctx.full and not project_visible(ctx, project_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")
        if not can_edit_project_content(db, ctx, project_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для привязки к проекту")
        db.add(OwnerWorkspaceProjectContact(project_id=project_id, contact_id=row.id))
    _log_audit(
        db,
        entity_type="contact",
        entity_id=row.id,
        action_type="create",
        author_id=ctx.user.id,
        new_value={"full_name": row.full_name, "phone": row.phone},
    )
    db.commit()
    db.refresh(row)
    return _contact_to_response(db, row)


@router.get("/contacts/{contact_id}", response_model=OwnerWorkspaceContactResponse)
async def get_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == contact_id).first()
    if not row or not contact_visible(ctx, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    return _contact_to_response(db, row)


@router.patch("/contacts/{contact_id}", response_model=OwnerWorkspaceContactResponse)
async def update_contact(
    contact_id: int,
    payload: OwnerWorkspaceContactUpdate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == contact_id).first()
    if not row or not contact_visible(ctx, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    if not can_update_contact_content(db, ctx, contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    old = {"full_name": row.full_name, "phone": row.phone}
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    _log_audit(
        db,
        entity_type="contact",
        entity_id=row.id,
        action_type="update",
        author_id=ctx.user.id,
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not contact_visible(ctx, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    rows = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.contact_id == contact_id).order_by(
        OwnerWorkspaceTask.created_at.desc()
    ).all()
    rows = [r for r in rows if task_visible(ctx, r)]
    return [_task_to_response(db, row) for row in rows]


@router.get("/contacts/{contact_id}/messages", response_model=List[OwnerWorkspaceMessageResponse])
async def get_contact_messages(
    contact_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not contact_visible(ctx, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    rows = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.contact_id == contact_id).order_by(
        OwnerWorkspaceMessage.created_at.desc()
    ).all()
    resp = [_message_to_response(db, row) for row in rows]
    _mark_conversation_read_for_user(db, ctx.user.id, contact_id)
    return resp


def _owner_workspace_tasks_filtered_query(
    db: Session,
    ctx: OwnerWorkspaceAccessContext,
    *,
    project_id: Optional[int],
    contact_id: Optional[int],
    status_filter: Optional[str],
    priority: Optional[str],
    assignee_id: Optional[int],
    overdue_only: bool,
    active_only: bool,
    search: Optional[str],
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
    return filter_tasks_query(q, ctx)


def _assert_task_list_scope(
    ctx: OwnerWorkspaceAccessContext,
    *,
    assignee_id: Optional[int],
    project_id: Optional[int],
    contact_id: Optional[int],
) -> None:
    if not ctx.full:
        if assignee_id is not None and assignee_id != ctx.user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        if project_id is not None and not project_visible(ctx, project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        if contact_id is not None and not contact_visible(ctx, contact_id):
            raise HTTPException(status_code=404, detail="Contact not found")


@router.get("/tasks", response_model=OwnerWorkspaceTaskListResponse)
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
    limit: int = Query(100, ge=1, le=500, description="Размер страницы"),
    offset: int = Query(0, ge=0, description="Смещение"),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    _assert_task_list_scope(
        ctx,
        assignee_id=assignee_id,
        project_id=project_id,
        contact_id=contact_id,
    )
    q = _owner_workspace_tasks_filtered_query(
        db,
        ctx,
        project_id=project_id,
        contact_id=contact_id,
        status_filter=status_filter,
        priority=priority,
        assignee_id=assignee_id,
        overdue_only=overdue_only,
        active_only=active_only,
        search=search,
    )

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
    total = q.count()
    rows = q.order_by(order_expr).offset(offset).limit(limit).all()
    return OwnerWorkspaceTaskListResponse(
        items=[_task_to_response(db, row) for row in rows],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.get("/tasks/status-counts", response_model=OwnerWorkspaceTaskStatusCountsResponse)
async def task_status_counts(
    project_id: Optional[int] = Query(None),
    contact_id: Optional[int] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    active_only: bool = Query(False),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """
    Счётчики по статусам при тех же фильтрах, что GET /tasks, но без status_filter
    (чтобы на вкладке «Задачи» показывать распределение по статусам).
    """
    _assert_task_list_scope(
        ctx,
        assignee_id=assignee_id,
        project_id=project_id,
        contact_id=contact_id,
    )
    q = _owner_workspace_tasks_filtered_query(
        db,
        ctx,
        project_id=project_id,
        contact_id=contact_id,
        status_filter=None,
        priority=priority,
        assignee_id=assignee_id,
        overdue_only=overdue_only,
        active_only=active_only,
        search=search,
    )
    rows = (
        q.with_entities(OwnerWorkspaceTask.status, func.count(OwnerWorkspaceTask.id))
        .group_by(OwnerWorkspaceTask.status)
        .all()
    )
    known = ("new", "in_progress", "waiting", "completed", "cancelled")
    by_status: Dict[str, int] = {s: 0 for s in known}
    for st, cnt in rows:
        k = st if st is not None else ""
        by_status[k] = int(cnt)
    total = sum(by_status.values())
    return OwnerWorkspaceTaskStatusCountsResponse(total=total, by_status=by_status)


@router.post("/tasks", response_model=OwnerWorkspaceTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: OwnerWorkspaceTaskCreate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if not ctx.full and not permission_policy["limited_can_create_tasks"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.contact_id is not None and not can_edit_contact_content(db, ctx, payload.contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.project_id is not None and not project_visible(ctx, payload.project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")
    if payload.project_id is not None and not can_edit_project_content(db, ctx, payload.project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.contact_id is not None and not contact_visible(ctx, payload.contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к контакту")
    if payload.contact_id is not None and not can_edit_contact_content(db, ctx, payload.contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.previous_task_id is not None:
        prev = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == payload.previous_task_id).first()
        if not prev or not task_visible(ctx, prev):
            raise HTTPException(status_code=404, detail="Previous task not found")
    for message_id in payload.linked_message_ids or []:
        msg = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
        if not msg:
            continue
        if not ctx.full and not contact_visible(ctx, msg.contact_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к сообщению")
    row = OwnerWorkspaceTask(
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        status=payload.status or "new",
        priority=payload.priority or "medium",
        deadline_at=payload.deadline_at,
        start_at=payload.start_at,
        assignee_id=payload.assignee_id,
        creator_id=ctx.user.id,
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
        author_id=ctx.user.id,
        new_value={"title": row.title, "status": row.status},
    )
    notify_task_assigned(db, row, row.assignee_id, ctx.user.id)
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.get("/tasks/{task_id}", response_model=OwnerWorkspaceTaskResponse)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row or not task_visible(ctx, row):
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(db, row)


@router.patch("/tasks/{task_id}", response_model=OwnerWorkspaceTaskResponse)
async def update_task(
    task_id: int,
    payload: OwnerWorkspaceTaskUpdate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row or not task_visible(ctx, row):
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_write_access(db, ctx, row)
    if not can_update_task_content(db, ctx, row):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")

    data = payload.model_dump(exclude_unset=True)
    new_project_id = data.get("project_id", row.project_id)
    new_contact_id = data.get("contact_id", row.contact_id)
    if new_project_id is not None and not project_visible(ctx, new_project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")
    if new_project_id is not None and not can_edit_project_content(db, ctx, new_project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if new_contact_id is not None and not contact_visible(ctx, new_contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к контакту")
    if new_contact_id is not None and not can_edit_contact_content(db, ctx, new_contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if row.status in ("completed", "cancelled"):
        new_status = data.get("status", row.status)
        extra = {k for k in data if k != "status"}
        if new_status in ("completed", "cancelled"):
            if extra:
                raise HTTPException(
                    status_code=400,
                    detail="У завершённой или отменённой задачи можно изменить только статус (например, вернуть в работу)",
                )
        # reopening (new_status активный): разрешаем полное обновление за один запрос

    old = {"status": row.status, "assignee_id": row.assignee_id, "priority": row.priority}
    for k, v in data.items():
        setattr(row, k, v)
    if "status" in data:
        if row.status == "completed" and row.completed_at is None:
            row.completed_at = datetime.now(timezone.utc)
        elif row.status != "completed":
            row.completed_at = None

    if "linked_message_ids" in data:
        for message_id in data.get("linked_message_ids") or []:
            msg = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
            if msg and not ctx.full and not contact_visible(ctx, msg.contact_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к сообщению")
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
        author_id=ctx.user.id,
        old_value=old,
        new_value=data,
    )
    if "assignee_id" in data and row.assignee_id != old.get("assignee_id"):
        notify_task_assigned(db, row, row.assignee_id, ctx.user.id)
    if data and not set(data.keys()) <= {"assignee_id"}:
        notify_task_updated(db, row, actor_id=ctx.user.id, changed_fields=data)
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """Удаление задачи из БД (только admin/owner). Связи и комментарии удаляются каскадом."""
    assert_full_workspace(ctx)
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row or not task_visible(ctx, row):
        raise HTTPException(status_code=404, detail="Task not found")
    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="delete",
        author_id=ctx.user.id,
        old_value={"title": row.title, "status": row.status},
        new_value=None,
    )
    db.delete(row)
    db.commit()
    return None


@router.post("/tasks/bulk-update")
async def bulk_update_tasks(
    payload: OwnerWorkspaceTaskBulkUpdate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not can_bulk_update_tasks(db, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")
    data = payload.model_dump(exclude_unset=True)
    task_ids = data.pop("task_ids", [])
    if not data:
        raise HTTPException(status_code=400, detail="Укажите status, assignee_id и/или priority")
    updated = 0
    for tid in task_ids:
        row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == tid).first()
        if not row or not task_visible(ctx, row):
            continue
        if row.project_id is not None and not can_edit_project_content(db, ctx, row.project_id):
            continue
        if row.status in ("completed", "cancelled"):
            new_status = data.get("status", row.status)
            extra = {k for k in data if k != "status"}
            if new_status in ("completed", "cancelled"):
                if extra:
                    continue
            # при смене на активный статус применяем все поля из data
        old = {"status": row.status, "assignee_id": row.assignee_id, "priority": row.priority}
        prev_assignee = row.assignee_id
        for k, v in data.items():
            setattr(row, k, v)
        if "status" in data:
            if row.status == "completed" and row.completed_at is None:
                row.completed_at = datetime.now(timezone.utc)
            elif row.status != "completed":
                row.completed_at = None
        if "assignee_id" in data and row.assignee_id != prev_assignee:
            notify_task_assigned(db, row, row.assignee_id, ctx.user.id)
        _log_audit(
            db,
            entity_type="task",
            entity_id=row.id,
            action_type="bulk_update",
            author_id=ctx.user.id,
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
) -> OwnerWorkspaceTaskCompleteResponse:
    row = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not row or not task_visible(ctx, row):
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_write_access(db, ctx, row)
    if not can_complete_task(db, ctx, row):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")
    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    _log_audit(
        db,
        entity_type="task",
        entity_id=row.id,
        action_type="complete",
        author_id=ctx.user.id,
    )

    new_task_row: Optional[OwnerWorkspaceTask] = None
    if payload.action == "close_and_create_next":
        permission_policy = get_owner_workspace_permission_policy(db)
        if not ctx.full and not permission_policy["limited_can_create_tasks"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
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
        target_project_id = next_data.project_id if next_data.project_id is not None else row.project_id
        target_contact_id = next_data.contact_id if next_data.contact_id is not None else row.contact_id
        if target_project_id is not None and not project_visible(ctx, target_project_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")
        if target_project_id is not None and not can_edit_project_content(db, ctx, target_project_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        if target_contact_id is not None and not contact_visible(ctx, target_contact_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к контакту")
        if target_contact_id is not None and not can_edit_contact_content(db, ctx, target_contact_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        new_task_row = OwnerWorkspaceTask(
            title=next_data.title.strip(),
            description=(next_data.description or "").strip() or None,
            status=next_data.status or "new",
            priority=next_data.priority or row.priority,
            deadline_at=next_data.deadline_at,
            start_at=next_data.start_at,
            assignee_id=next_data.assignee_id if next_data.assignee_id is not None else row.assignee_id,
            creator_id=ctx.user.id,
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
            author_id=ctx.user.id,
            new_value={"previous_task_id": row.id},
        )
        notify_task_assigned(db, new_task_row, new_task_row.assignee_id, ctx.user.id)

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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    req = OwnerWorkspaceTaskCompleteRequest(action="close_and_create_next", next_task=payload)
    return await complete_task(task_id=task_id, payload=req, db=db, ctx=ctx)


@router.get("/tasks/{task_id}/comments", response_model=List[OwnerWorkspaceTaskCommentResponse])
async def list_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    exists = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not exists or not task_visible(ctx, exists):
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if not ctx.full and not permission_policy["limited_can_comment_tasks"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    exists = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not exists or not task_visible(ctx, exists):
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_write_access(db, ctx, exists)
    row = OwnerWorkspaceTaskComment(task_id=task_id, author_id=ctx.user.id, text=payload.text.strip())
    db.add(row)
    db.flush()
    notify_task_comment_added(
        db,
        exists,
        comment_id=row.id,
        author_id=ctx.user.id,
        comment_text=row.text,
    )
    notify_task_comment_mentions(
        db,
        exists,
        comment_id=row.id,
        author_id=ctx.user.id,
        comment_text=row.text,
    )
    db.commit()
    db.refresh(row)
    return OwnerWorkspaceTaskCommentResponse.model_validate(row)


@router.post("/tasks/{task_id}/link-message", status_code=status.HTTP_204_NO_CONTENT)
async def link_message_to_task(
    task_id: int,
    payload: OwnerWorkspaceTaskMessageLink,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not task or not task_visible(ctx, task):
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_link_task_messages(db, ctx, task):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == payload.message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not ctx.full and not contact_visible(ctx, message.contact_id):
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == task_id).first()
    if not task or not task_visible(ctx, task):
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_link_task_messages(db, ctx, task):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    q = db.query(OwnerWorkspaceMessage)
    if contact_id is not None:
        if not contact_visible(ctx, contact_id):
            raise HTTPException(status_code=404, detail="Contact not found")
        q = q.filter(OwnerWorkspaceMessage.contact_id == contact_id)
    elif not ctx.full:
        if not ctx.contact_ids:
            return []
        q = q.filter(OwnerWorkspaceMessage.contact_id.in_(list(ctx.contact_ids)))
    rows = q.order_by(OwnerWorkspaceMessage.created_at.desc()).all()
    return [_message_to_response(db, row) for row in rows]


@router.get("/messages/conversations", response_model=List[OwnerWorkspaceConversationItem])
async def list_conversations(
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    base = (
        db.query(
            OwnerWorkspaceContact.id.label("contact_id"),
            OwnerWorkspaceContact.full_name.label("contact_name"),
            func.max(OwnerWorkspaceMessage.created_at).label("last_message_at"),
        )
        .join(OwnerWorkspaceMessage, OwnerWorkspaceMessage.contact_id == OwnerWorkspaceContact.id)
    )
    if not ctx.full:
        if not ctx.contact_ids:
            return []
        base = base.filter(OwnerWorkspaceContact.id.in_(list(ctx.contact_ids)))
    rows = (
        base.group_by(OwnerWorkspaceContact.id, OwnerWorkspaceContact.full_name)
        .order_by(func.max(OwnerWorkspaceMessage.created_at).desc())
        .all()
    )
    contact_ids = [int(r.contact_id) for r in rows]
    unread_map = _batch_unread_incoming_message_counts(db, ctx.user.id, contact_ids)
    out: List[OwnerWorkspaceConversationItem] = []
    for row in rows:
        last_message = (
            db.query(OwnerWorkspaceMessage)
            .filter(OwnerWorkspaceMessage.contact_id == row.contact_id)
            .order_by(OwnerWorkspaceMessage.created_at.desc())
            .first()
        )
        cid = int(row.contact_id)
        out.append(
            OwnerWorkspaceConversationItem(
                contact_id=cid,
                contact_name=row.contact_name,
                last_message_at=row.last_message_at,
                last_message_text=getattr(last_message, "text", None),
                unread_count=int(unread_map.get(cid, 0)),
            )
        )
    return out


@router.get("/contacts/{contact_id}/conversation", response_model=List[OwnerWorkspaceMessageResponse])
async def contact_conversation(
    contact_id: int,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    return await get_contact_messages(contact_id=contact_id, db=db, ctx=ctx)


@router.post("/messages/sync-from-max")
async def sync_max_messages_into_owner_workspace(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """
    Импорт исходящих сообщений MAX (таблица max_messages) в переписку owner workspace.
    Сопоставление по нормализованному телефону контакта. Дубликаты пропускаются (external_message_id = max:<uuid>).
    """
    assert_full_workspace(ctx)
    imported, skipped = run_owner_workspace_max_sync(db, limit=limit)
    return {"imported": imported, "skipped": skipped}


@router.post("/messages", response_model=OwnerWorkspaceMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: OwnerWorkspaceMessageCreate,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if payload.direction != "incoming" and not ctx.full and not permission_policy["limited_can_send_messages"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    contact = db.query(OwnerWorkspaceContact).filter(OwnerWorkspaceContact.id == payload.contact_id).first()
    if not contact or not contact_visible(ctx, payload.contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    if not ctx.full:
        linked_project_ids = {
            row.project_id
            for row in db.query(OwnerWorkspaceProjectContact.project_id)
            .filter(OwnerWorkspaceProjectContact.contact_id == payload.contact_id)
            .all()
        }
        if linked_project_ids and not any(can_edit_project_content(db, ctx, pid) for pid in linked_project_ids):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if not can_edit_contact_content(db, ctx, payload.contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
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
    db.flush()
    if row.direction == "incoming":
        notify_incoming_contact_message(
            db,
            row,
            contact_name=(contact.full_name or contact.phone or f"Контакт #{contact.id}")[:255],
            exclude_user_ids={ctx.user.id},
        )
    db.commit()
    db.refresh(row)
    return _message_to_response(db, row)


@router.post("/messages/{message_id}/create-task", response_model=OwnerWorkspaceTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task_from_message(
    message_id: int,
    payload: OwnerWorkspaceMessageCreateTaskRequest,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    permission_policy = get_owner_workspace_permission_policy(db)
    if not ctx.full and not permission_policy["limited_can_create_tasks"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not ctx.full and not contact_visible(ctx, message.contact_id):
        raise HTTPException(status_code=404, detail="Message not found")
    if not can_edit_contact_content(db, ctx, message.contact_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if payload.project_id is not None and not project_visible(ctx, payload.project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")
    if payload.project_id is not None and not can_edit_project_content(db, ctx, payload.project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    row = OwnerWorkspaceTask(
        title=payload.title.strip(),
        description=(payload.description or message.text or "").strip() or None,
        status="new",
        priority=payload.priority or "medium",
        deadline_at=payload.deadline_at,
        assignee_id=payload.assignee_id,
        creator_id=ctx.user.id,
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
        author_id=ctx.user.id,
        new_value={"message_id": message_id},
    )
    notify_task_assigned(db, row, row.assignee_id, ctx.user.id)
    db.commit()
    db.refresh(row)
    return _task_to_response(db, row)


@router.post("/messages/{message_id}/link-task", status_code=status.HTTP_204_NO_CONTENT)
async def link_message_with_task(
    message_id: int,
    payload: OwnerWorkspaceMessageLinkTaskRequest,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    message = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not ctx.full and not contact_visible(ctx, message.contact_id):
        raise HTTPException(status_code=404, detail="Message not found")
    task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == payload.task_id).first()
    if not task or not task_visible(ctx, task):
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_link_task_messages(db, ctx, task):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ")
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """
    In-app уведомления для текущего пользователя: дедлайны (просрочка / скоро), назначение, комментарии.
    Перед выдачей списка синхронизирует записи по просроченным и скорым задачам (исполнитель).
    """
    refresh_deadline_notifications_for_user(db, ctx.user.id, due_soon_hours=due_soon_hours)
    q = db.query(OwnerWorkspaceNotification).filter(OwnerWorkspaceNotification.user_id == ctx.user.id)
    if unread_only:
        q = q.filter(OwnerWorkspaceNotification.read_at.is_(None))
    rows = q.order_by(OwnerWorkspaceNotification.created_at.desc()).limit(limit).all()
    unread = (
        db.query(func.count(OwnerWorkspaceNotification.id))
        .filter(
            OwnerWorkspaceNotification.user_id == ctx.user.id,
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    n = (
        db.query(OwnerWorkspaceNotification)
        .filter(
            OwnerWorkspaceNotification.id == notification_id,
            OwnerWorkspaceNotification.user_id == ctx.user.id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(n)
    return OwnerWorkspaceNotificationResponse.model_validate(n)


@router.get("/me/preferences", response_model=OwnerWorkspaceUserPreferencesResponse)
async def get_owner_workspace_my_preferences(
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """Персональные настройки интерфейса задачника (вкладка «Настройки»)."""
    data = get_preferences_for_user(db, ctx.user.id)
    return OwnerWorkspaceUserPreferencesResponse.model_validate(data)


@router.patch("/me/preferences", response_model=OwnerWorkspaceUserPreferencesResponse)
async def patch_owner_workspace_my_preferences(
    payload: OwnerWorkspaceUserPreferencesPatch,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    patch = payload.model_dump(exclude_unset=True)
    data = merge_preferences_for_user(db, ctx.user.id, patch)
    return OwnerWorkspaceUserPreferencesResponse.model_validate(data)


@router.get("/me/web-push", response_model=OwnerWorkspaceWebPushStatusResponse)
async def get_owner_workspace_web_push_status(
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    count = (
        db.query(func.count(OwnerWorkspaceWebPushSubscription.id))
        .filter(OwnerWorkspaceWebPushSubscription.user_id == ctx.user.id)
        .scalar()
        or 0
    )
    public_key = get_web_push_public_key()
    return OwnerWorkspaceWebPushStatusResponse(
        configured=bool(public_key),
        public_key=public_key,
        subscription_count=int(count),
    )


@router.post("/me/web-push/subscriptions", response_model=OwnerWorkspaceWebPushStatusResponse)
async def upsert_owner_workspace_web_push_subscription(
    payload: OwnerWorkspaceWebPushSubscriptionUpsert,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    endpoint = payload.endpoint.strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail="Endpoint is required")
    row = (
        db.query(OwnerWorkspaceWebPushSubscription)
        .filter(OwnerWorkspaceWebPushSubscription.endpoint == endpoint)
        .first()
    )
    if row is None:
        row = OwnerWorkspaceWebPushSubscription(
            user_id=ctx.user.id,
            endpoint=endpoint,
            p256dh=payload.p256dh.strip(),
            auth=payload.auth.strip(),
            user_agent=(payload.user_agent or "").strip() or None,
        )
        db.add(row)
    else:
        row.user_id = ctx.user.id
        row.p256dh = payload.p256dh.strip()
        row.auth = payload.auth.strip()
        row.user_agent = (payload.user_agent or "").strip() or None
    db.commit()
    count = (
        db.query(func.count(OwnerWorkspaceWebPushSubscription.id))
        .filter(OwnerWorkspaceWebPushSubscription.user_id == ctx.user.id)
        .scalar()
        or 0
    )
    public_key = get_web_push_public_key()
    return OwnerWorkspaceWebPushStatusResponse(
        configured=bool(public_key),
        public_key=public_key,
        subscription_count=int(count),
    )


@router.post("/me/web-push/subscriptions/remove", response_model=OwnerWorkspaceWebPushStatusResponse)
async def remove_owner_workspace_web_push_subscription(
    payload: OwnerWorkspaceWebPushSubscriptionDelete,
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    endpoint = payload.endpoint.strip()
    if endpoint:
        (
            db.query(OwnerWorkspaceWebPushSubscription)
            .filter(
                OwnerWorkspaceWebPushSubscription.user_id == ctx.user.id,
                OwnerWorkspaceWebPushSubscription.endpoint == endpoint,
            )
            .delete(synchronize_session=False)
        )
        db.commit()
    count = (
        db.query(func.count(OwnerWorkspaceWebPushSubscription.id))
        .filter(OwnerWorkspaceWebPushSubscription.user_id == ctx.user.id)
        .scalar()
        or 0
    )
    public_key = get_web_push_public_key()
    return OwnerWorkspaceWebPushStatusResponse(
        configured=bool(public_key),
        public_key=public_key,
        subscription_count=int(count),
    )


@router.get("/analytics/tasks-overview", response_model=OwnerWorkspaceTasksAnalyticsOverview)
async def owner_workspace_tasks_analytics_overview(
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """
    Краткая аналитика по задачам в зоне видимости пользователя (§17): завершённые за 7/30 дней,
    среднее число дней от создания до завершения среди задач, завершённых за последние 30 дней.
    """
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)
    T = OwnerWorkspaceTask

    def q():
        return filter_tasks_query(db.query(T), ctx)

    completed_7 = (
        q()
        .filter(T.status == "completed", T.completed_at.isnot(None), T.completed_at >= d7)
        .count()
    )
    completed_30 = (
        q()
        .filter(T.status == "completed", T.completed_at.isnot(None), T.completed_at >= d30)
        .count()
    )
    done_rows = (
        q()
        .filter(
            T.status == "completed",
            T.completed_at.isnot(None),
            T.created_at.isnot(None),
            T.completed_at >= d30,
        )
        .all()
    )
    avg_days: Optional[float] = None
    if done_rows:
        deltas = []
        for r in done_rows:
            ca = r.completed_at
            cr = r.created_at
            if ca and cr:
                deltas.append((ca - cr).total_seconds() / 86400.0)
        if deltas:
            avg_days = round(sum(deltas) / len(deltas), 2)
    return OwnerWorkspaceTasksAnalyticsOverview(
        completed_last_7_days=int(completed_7),
        completed_last_30_days=int(completed_30),
        avg_days_to_complete_last_30=avg_days,
    )


@router.get("/digest", response_model=OwnerWorkspaceDigestResponse)
async def owner_workspace_digest(
    due_within_hours: int = Query(48, ge=1, le=336),
    assignee_id: Optional[int] = Query(None, description="Только задачи этого исполнителя"),
    project_id: Optional[int] = Query(None, description="Только задачи этого проекта"),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """Сводка для уведомлений: просроченные и задачи с дедлайном в ближайшие N часов."""
    if not ctx.full:
        if assignee_id is not None and assignee_id != ctx.user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        if project_id is not None and not project_visible(ctx, project_id):
            raise HTTPException(status_code=404, detail="Project not found")
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
    overdue_q = filter_tasks_query(overdue_q, ctx)
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
    overdue_count_q = filter_tasks_query(overdue_count_q, ctx)
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
    due_soon_q = filter_tasks_query(due_soon_q, ctx)
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
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    """Единый поиск по проектам, контактам и задачам владельческого задачника."""
    term = (q or "").strip()
    if len(term) < 2:
        return OwnerWorkspaceSearchResponse(projects=[], contacts=[], tasks=[], messages=[])
    like = f"%{term}%"
    prow_q = db.query(OwnerWorkspaceProject).filter(
        or_(
            OwnerWorkspaceProject.name.ilike(like),
            OwnerWorkspaceProject.description.ilike(like),
        )
    )
    if not ctx.full:
        if not ctx.project_ids:
            projects = []
            prow = []
        else:
            prow_q = prow_q.filter(OwnerWorkspaceProject.id.in_(list(ctx.project_ids)))
            prow = prow_q.order_by(OwnerWorkspaceProject.created_at.desc()).limit(limit).all()
            projects = [OwnerWorkspaceSearchProjectHit(id=r.id, name=r.name, status=r.status) for r in prow]
    else:
        prow = prow_q.order_by(OwnerWorkspaceProject.created_at.desc()).limit(limit).all()
        projects = [OwnerWorkspaceSearchProjectHit(id=r.id, name=r.name, status=r.status) for r in prow]
    crow_q = db.query(OwnerWorkspaceContact).filter(
        or_(
            OwnerWorkspaceContact.full_name.ilike(like),
            OwnerWorkspaceContact.phone.ilike(like),
            OwnerWorkspaceContact.company.ilike(like),
            func.coalesce(OwnerWorkspaceContact.comment, "").ilike(like),
        )
    )
    if not ctx.full:
        if not ctx.contact_ids:
            contacts = []
            crow = []
        else:
            crow_q = crow_q.filter(OwnerWorkspaceContact.id.in_(list(ctx.contact_ids)))
            crow = crow_q.order_by(OwnerWorkspaceContact.created_at.desc()).limit(limit).all()
            contacts = [
                OwnerWorkspaceSearchContactHit(id=r.id, full_name=r.full_name, phone=r.phone or "") for r in crow
            ]
    else:
        crow = crow_q.order_by(OwnerWorkspaceContact.created_at.desc()).limit(limit).all()
        contacts = [
            OwnerWorkspaceSearchContactHit(id=r.id, full_name=r.full_name, phone=r.phone or "") for r in crow
        ]
    trow_q = db.query(OwnerWorkspaceTask).filter(
        or_(
            OwnerWorkspaceTask.title.ilike(like),
            OwnerWorkspaceTask.description.ilike(like),
            cast(OwnerWorkspaceTask.tags, String).ilike(like),
        )
    )
    trow_q = filter_tasks_query(trow_q, ctx)
    trow = trow_q.order_by(OwnerWorkspaceTask.created_at.desc()).limit(limit).all()
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
    m_q = db.query(OwnerWorkspaceMessage).filter(OwnerWorkspaceMessage.text.ilike(like))
    if not ctx.full:
        if not ctx.contact_ids:
            mrows = []
        else:
            m_q = m_q.filter(OwnerWorkspaceMessage.contact_id.in_(list(ctx.contact_ids)))
            mrows = m_q.order_by(OwnerWorkspaceMessage.created_at.desc()).limit(limit).all()
    else:
        mrows = m_q.order_by(OwnerWorkspaceMessage.created_at.desc()).limit(limit).all()
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
    action_type: Optional[str] = Query(None),
    author_id: Optional[int] = Query(None),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    limit: int = Query(300, ge=1, le=1000),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    ctx: OwnerWorkspaceAccessContext = Depends(get_owner_workspace_access),
):
    if not audit_history_allowed(db, ctx, entity_type, entity_id):
        return []
    q = db.query(OwnerWorkspaceAuditLog)
    if entity_type:
        q = q.filter(OwnerWorkspaceAuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(OwnerWorkspaceAuditLog.entity_id == entity_id)
    if action_type:
        q = q.filter(OwnerWorkspaceAuditLog.action_type == action_type)
    if author_id is not None:
        q = q.filter(OwnerWorkspaceAuditLog.author_id == author_id)
    if created_from is not None:
        q = q.filter(OwnerWorkspaceAuditLog.created_at >= created_from)
    if created_to is not None:
        q = q.filter(OwnerWorkspaceAuditLog.created_at <= created_to)
    order_clause = OwnerWorkspaceAuditLog.created_at.asc() if sort_order == "asc" else OwnerWorkspaceAuditLog.created_at.desc()
    rows = q.order_by(order_clause).limit(limit).all()
    return [OwnerWorkspaceAuditLogResponse.model_validate(x) for x in rows]


