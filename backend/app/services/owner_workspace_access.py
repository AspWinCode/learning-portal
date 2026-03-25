"""
Правила видимости Owner workspace для ролей admin/owner (полный доступ)
и sales/trainer (только свои проекты и связанные сущности).
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Dict, FrozenSet, Iterable, Optional, Set

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    OwnerWorkspaceContact,
    OwnerWorkspaceProject,
    OwnerWorkspaceProjectContact,
    OwnerWorkspaceProjectParticipant,
    OwnerWorkspaceTask,
    OwnerWorkspaceAuditLog,
    AppSetting,
    User,
    UserRole,
)

# Роли, которым разрешён вход в API owner-workspace (роутер).
OWNER_WORKSPACE_API_ROLES = ["admin", "owner", "sales", "trainer"]
OWNER_WS_PERMISSION_POLICY_KEY = "owner_workspace_permission_policy"
DEFAULT_OWNER_WS_PERMISSION_POLICY = {
    "manager_can_manage_team": True,
    "manager_can_change_roles": False,
    "manager_can_assign_manager": False,
    "manager_can_assign_observer": False,
    "manager_can_remove_manager": False,
    "manager_can_edit_project_meta": False,
    "manager_can_archive_project": False,
    "limited_can_create_projects": False,
    "limited_can_create_contacts": False,
    "limited_can_create_tasks": False,
    "limited_can_edit_contacts": False,
    "limited_can_edit_tasks": False,
    "limited_can_manage_project_contacts": False,
    "limited_can_complete_tasks": False,
    "limited_can_bulk_update_tasks": False,
    "limited_can_link_messages": False,
    "limited_can_send_messages": False,
    "limited_can_comment_tasks": False,
}


def is_full_workspace_user(user: User) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.OWNER)


@dataclass(frozen=True)
class OwnerWorkspaceAccessContext:
    user: User
    full: bool
    project_ids: FrozenSet[int]
    contact_ids: FrozenSet[int]


def get_owner_workspace_permission_policy(db: Session) -> dict:
    setting = db.query(AppSetting).filter(AppSetting.key == OWNER_WS_PERMISSION_POLICY_KEY).first()
    if not setting or not (setting.value or "").strip():
        return DEFAULT_OWNER_WS_PERMISSION_POLICY
    try:
        raw = json.loads(setting.value)
    except Exception:
        return DEFAULT_OWNER_WS_PERMISSION_POLICY
    if not isinstance(raw, dict):
        return DEFAULT_OWNER_WS_PERMISSION_POLICY
    return {
        "manager_can_manage_team": bool(raw.get("manager_can_manage_team", True)),
        "manager_can_change_roles": bool(raw.get("manager_can_change_roles", False)),
        "manager_can_assign_manager": bool(raw.get("manager_can_assign_manager", False)),
        "manager_can_assign_observer": bool(raw.get("manager_can_assign_observer", False)),
        "manager_can_remove_manager": bool(raw.get("manager_can_remove_manager", False)),
        "manager_can_edit_project_meta": bool(raw.get("manager_can_edit_project_meta", False)),
        "manager_can_archive_project": bool(raw.get("manager_can_archive_project", False)),
        "limited_can_create_projects": bool(raw.get("limited_can_create_projects", False)),
        "limited_can_create_contacts": bool(raw.get("limited_can_create_contacts", False)),
        "limited_can_create_tasks": bool(raw.get("limited_can_create_tasks", False)),
        "limited_can_edit_contacts": bool(raw.get("limited_can_edit_contacts", False)),
        "limited_can_edit_tasks": bool(raw.get("limited_can_edit_tasks", False)),
        "limited_can_manage_project_contacts": bool(raw.get("limited_can_manage_project_contacts", False)),
        "limited_can_complete_tasks": bool(raw.get("limited_can_complete_tasks", False)),
        "limited_can_bulk_update_tasks": bool(raw.get("limited_can_bulk_update_tasks", False)),
        "limited_can_link_messages": bool(raw.get("limited_can_link_messages", False)),
        "limited_can_send_messages": bool(raw.get("limited_can_send_messages", False)),
        "limited_can_comment_tasks": bool(raw.get("limited_can_comment_tasks", False)),
    }


def _base_accessible_project_ids(db: Session, user_id: int) -> Set[int]:
    owned = {
        r[0]
        for r in db.query(OwnerWorkspaceProject.id)
        .filter(OwnerWorkspaceProject.owner_id == user_id)
        .all()
    }
    part = {
        r[0]
        for r in db.query(OwnerWorkspaceProjectParticipant.project_id)
        .filter(OwnerWorkspaceProjectParticipant.user_id == user_id)
        .all()
    }
    return owned | part


def _expand_with_subprojects(db: Session, seed: Set[int]) -> Set[int]:
    if not seed:
        return set()
    current = set(seed)
    while True:
        children = {
            r[0]
            for r in db.query(OwnerWorkspaceProject.id)
            .filter(OwnerWorkspaceProject.parent_project_id.in_(current))
            .all()
        }
        nxt = current | children
        if nxt == current:
            return nxt
        current = nxt


def accessible_project_ids(db: Session, user_id: int) -> Set[int]:
    base = _base_accessible_project_ids(db, user_id)
    return _expand_with_subprojects(db, base)


def contact_ids_linked_to_projects(db: Session, project_ids: Set[int]) -> Set[int]:
    if not project_ids:
        return set()
    return {
        r[0]
        for r in db.query(OwnerWorkspaceProjectContact.contact_id)
        .filter(OwnerWorkspaceProjectContact.project_id.in_(project_ids))
        .all()
    }


def contact_ids_from_user_tasks(db: Session, user_id: int) -> Set[int]:
    rows = (
        db.query(OwnerWorkspaceTask.contact_id)
        .filter(
            OwnerWorkspaceTask.contact_id.isnot(None),
            (OwnerWorkspaceTask.assignee_id == user_id) | (OwnerWorkspaceTask.creator_id == user_id),
        )
        .distinct()
        .all()
    )
    return {r[0] for r in rows if r[0] is not None}


def visible_contact_ids_limited(db: Session, user_id: int, project_ids: Set[int]) -> Set[int]:
    return contact_ids_linked_to_projects(db, project_ids) | contact_ids_from_user_tasks(db, user_id)


def build_owner_workspace_access_context(db: Session, user: User) -> OwnerWorkspaceAccessContext:
    if is_full_workspace_user(user):
        return OwnerWorkspaceAccessContext(
            user=user,
            full=True,
            project_ids=frozenset(),
            contact_ids=frozenset(),
        )
    pids = accessible_project_ids(db, user.id)
    cids = visible_contact_ids_limited(db, user.id, pids)
    return OwnerWorkspaceAccessContext(
        user=user,
        full=False,
        project_ids=frozenset(pids),
        contact_ids=frozenset(cids),
    )


def task_visible_for_limited(
    *,
    assignee_id: Optional[int],
    creator_id: Optional[int],
    project_id: Optional[int],
    contact_id: Optional[int],
    user_id: int,
    project_ids: Set[int],
    contact_ids: Set[int],
) -> bool:
    if assignee_id == user_id or creator_id == user_id:
        return True
    if project_id is not None and project_id in project_ids:
        return True
    if contact_id is not None and contact_id in contact_ids:
        return True
    return False


def task_visible(ctx: OwnerWorkspaceAccessContext, task: OwnerWorkspaceTask) -> bool:
    if ctx.full:
        return True
    return task_visible_for_limited(
        assignee_id=task.assignee_id,
        creator_id=task.creator_id,
        project_id=task.project_id,
        contact_id=task.contact_id,
        user_id=ctx.user.id,
        project_ids=set(ctx.project_ids),
        contact_ids=set(ctx.contact_ids),
    )


def user_can_see_owner_workspace_task(db: Session, user_id: int, task: OwnerWorkspaceTask) -> bool:
    """Проверка видимости задачи для другого пользователя (упоминания, уведомления)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in OWNER_WORKSPACE_API_ROLES:
        return False
    ctx = build_owner_workspace_access_context(db, user)
    return task_visible(ctx, task)


def contact_visible(ctx: OwnerWorkspaceAccessContext, contact_id: int) -> bool:
    if ctx.full:
        return True
    return contact_id in ctx.contact_ids


def project_visible(ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    if ctx.full:
        return True
    return project_id in ctx.project_ids


def is_project_owner(db: Session, user_id: int, project_id: int) -> bool:
    p = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
    return bool(p and p.owner_id == user_id)


def is_project_participant(db: Session, user_id: int, project_id: int) -> bool:
    return (
        db.query(OwnerWorkspaceProjectParticipant)
        .filter(
            OwnerWorkspaceProjectParticipant.project_id == project_id,
            OwnerWorkspaceProjectParticipant.user_id == user_id,
        )
        .first()
        is not None
    )


def project_participant_record(db: Session, project_id: int, user_id: int) -> Optional[OwnerWorkspaceProjectParticipant]:
    return (
        db.query(OwnerWorkspaceProjectParticipant)
        .filter(
            OwnerWorkspaceProjectParticipant.project_id == project_id,
            OwnerWorkspaceProjectParticipant.user_id == user_id,
        )
        .first()
    )


def project_participant_role_name(db: Session, project_id: int, user_id: int) -> Optional[str]:
    row = project_participant_record(db, project_id, user_id)
    if not row:
        return None
    return (row.role or "member").strip().lower() or "member"


def is_project_manager(db: Session, user_id: int, project_id: int) -> bool:
    return project_participant_role_name(db, project_id, user_id) == "manager"


def can_manage_project_team(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    """Добавление/удаление участников: полный доступ, владелец проекта или участник с ролью manager."""
    if ctx.full:
        return True
    if is_project_owner(db, ctx.user.id, project_id):
        return True
    return is_project_manager(db, ctx.user.id, project_id) and get_owner_workspace_permission_policy(db)["manager_can_manage_team"]


def can_change_project_participant_roles(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    """Смена роли member/manager — только полный доступ или владелец проекта."""
    if ctx.full:
        return True
    if is_project_owner(db, ctx.user.id, project_id):
        return True
    return is_project_manager(db, ctx.user.id, project_id) and get_owner_workspace_permission_policy(db)["manager_can_change_roles"]


def can_edit_project_content(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    """Read-write access inside a project. observer stays read-only."""
    if ctx.full:
        return True
    if is_project_owner(db, ctx.user.id, project_id):
        return True
    role = project_participant_role_name(db, project_id, ctx.user.id)
    return role in {"member", "manager"}


def can_edit_project_meta(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    """Project card meta: name and description."""
    if ctx.full:
        return True
    if is_project_owner(db, ctx.user.id, project_id):
        return True
    return is_project_manager(db, ctx.user.id, project_id) and get_owner_workspace_permission_policy(db)["manager_can_edit_project_meta"]


def can_edit_contact_content(db: Session, ctx: OwnerWorkspaceAccessContext, contact_id: int) -> bool:
    """Write access for contact-centric actions.

    Limited users can edit a contact if they can write in at least one linked project
    or if the contact is reachable through one of their own tasks.
    """
    if ctx.full:
        return True
    linked_project_ids = {
        row[0]
        for row in db.query(OwnerWorkspaceProjectContact.project_id)
        .filter(OwnerWorkspaceProjectContact.contact_id == contact_id)
        .all()
    }
    if any(can_edit_project_content(db, ctx, project_id) for project_id in linked_project_ids):
        return True
    own_task = (
        db.query(OwnerWorkspaceTask.id)
        .filter(
            OwnerWorkspaceTask.contact_id == contact_id,
            or_(
                OwnerWorkspaceTask.assignee_id == ctx.user.id,
                OwnerWorkspaceTask.creator_id == ctx.user.id,
            ),
        )
        .first()
    )
    return own_task is not None


def can_update_contact_content(db: Session, ctx: OwnerWorkspaceAccessContext, contact_id: int) -> bool:
    if not can_edit_contact_content(db, ctx, contact_id):
        return False
    if ctx.full:
        return True
    return get_owner_workspace_permission_policy(db)["limited_can_edit_contacts"]


def can_update_task_content(db: Session, ctx: OwnerWorkspaceAccessContext, task: OwnerWorkspaceTask) -> bool:
    if not task_visible(ctx, task):
        return False
    if ctx.full:
        return True
    if task.project_id is not None and not can_edit_project_content(db, ctx, task.project_id):
        return False
    return get_owner_workspace_permission_policy(db)["limited_can_edit_tasks"]


def can_manage_project_contacts(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    if not can_edit_project_content(db, ctx, project_id):
        return False
    if ctx.full:
        return True
    return get_owner_workspace_permission_policy(db)["limited_can_manage_project_contacts"]


def can_complete_task(db: Session, ctx: OwnerWorkspaceAccessContext, task: OwnerWorkspaceTask) -> bool:
    if not task_visible(ctx, task):
        return False
    if ctx.full:
        return True
    if task.project_id is not None and not can_edit_project_content(db, ctx, task.project_id):
        return False
    return get_owner_workspace_permission_policy(db)["limited_can_complete_tasks"]


def can_bulk_update_tasks(db: Session, ctx: OwnerWorkspaceAccessContext) -> bool:
    if ctx.full:
        return True
    return get_owner_workspace_permission_policy(db)["limited_can_bulk_update_tasks"]


def can_link_task_messages(db: Session, ctx: OwnerWorkspaceAccessContext, task: OwnerWorkspaceTask) -> bool:
    if not task_visible(ctx, task):
        return False
    if ctx.full:
        return True
    if task.project_id is not None and not can_edit_project_content(db, ctx, task.project_id):
        return False
    return get_owner_workspace_permission_policy(db)["limited_can_link_messages"]


def can_archive_project(db: Session, ctx: OwnerWorkspaceAccessContext, project_id: int) -> bool:
    if ctx.full:
        return True
    if is_project_owner(db, ctx.user.id, project_id):
        return True
    return is_project_manager(db, ctx.user.id, project_id) and get_owner_workspace_permission_policy(db)["manager_can_archive_project"]


def assert_full_workspace(ctx: OwnerWorkspaceAccessContext) -> None:
    from fastapi import HTTPException, status

    if not ctx.full:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


def filter_tasks_query(q, ctx: OwnerWorkspaceAccessContext):
    """Ограничивает выборку задач для sales/trainer."""
    if ctx.full:
        return q
    uid = ctx.user.id
    parts = [
        OwnerWorkspaceTask.assignee_id == uid,
        OwnerWorkspaceTask.creator_id == uid,
    ]
    if ctx.project_ids:
        parts.append(OwnerWorkspaceTask.project_id.in_(list(ctx.project_ids)))
    if ctx.contact_ids:
        parts.append(OwnerWorkspaceTask.contact_id.in_(list(ctx.contact_ids)))
    return q.filter(or_(*parts))


def audit_history_allowed(
    db: Session, ctx: OwnerWorkspaceAccessContext, entity_type: Optional[str], entity_id: Optional[int]
) -> bool:
    if ctx.full:
        return True
    if not entity_type or entity_id is None:
        return True
    et = entity_type.strip().lower()
    if et == "project":
        return project_visible(ctx, entity_id)
    if et == "contact":
        return contact_visible(ctx, entity_id)
    if et == "task":
        t = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == entity_id).first()
        return bool(t and task_visible(ctx, t))
    return False


def audit_log_visible(
    db: Session, ctx: OwnerWorkspaceAccessContext, row: OwnerWorkspaceAuditLog, task_visibility_cache: Optional[Dict[int, bool]] = None
) -> bool:
    if ctx.full:
        return True
    et = (row.entity_type or "").strip().lower()
    entity_id = row.entity_id
    if et == "project":
        return project_visible(ctx, entity_id)
    if et == "contact":
        return contact_visible(ctx, entity_id)
    if et == "task":
        if task_visibility_cache is not None and entity_id in task_visibility_cache:
            return task_visibility_cache[entity_id]
        task = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id == entity_id).first()
        visible = bool(task and task_visible(ctx, task))
        if task_visibility_cache is not None:
            task_visibility_cache[entity_id] = visible
        return visible
    return False


def prefill_audit_log_task_visibility_cache(
    db: Session, ctx: OwnerWorkspaceAccessContext, rows: Iterable[OwnerWorkspaceAuditLog], task_visibility_cache: Dict[int, bool]
) -> None:
    task_ids = {
        row.entity_id
        for row in rows
        if (row.entity_type or "").strip().lower() == "task" and row.entity_id not in task_visibility_cache
    }
    if not task_ids:
        return
    tasks = db.query(OwnerWorkspaceTask).filter(OwnerWorkspaceTask.id.in_(task_ids)).all()
    found_ids = set()
    for task in tasks:
        task_visibility_cache[task.id] = task_visible(ctx, task)
        found_ids.add(task.id)
    for missing_id in task_ids - found_ids:
        task_visibility_cache[missing_id] = False
