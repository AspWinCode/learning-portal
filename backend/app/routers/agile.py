"""Agile-трекер для IT-проектов.

Пермишны:
  agile.admin  — owner/admin: полный контроль, управление доступом ролей
  agile.manage — создание/редактирование проектов, спринтов, эпиков, задач
  agile.access — просмотр, комментарии, закрытие своих задач

Для ролей trainer/sales/methodist/etc доступ управляется через таблицу agile_role_access.
"""

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    AgileRoleAccess,
    ItChecklistItem,
    ItEpic,
    ItIssue,
    ItIssueComment,
    ItProject,
    ItProjectMember,
    ItSprint,
    User,
    UserRole,
)
from app.schemas.agile import (
    AgileRoleAccessItem,
    AgileRoleAccessResponse,
    AgileRoleAccessUpdate,
    BurndownPoint,
    ItAnalyticsResponse,
    ItBacklogGroup,
    ItBacklogResponse,
    ItBoardColumn,
    ItBoardResponse,
    ItChecklistItemCreate,
    ItChecklistItemResponse,
    ItChecklistItemUpdate,
    ItEpicCreate,
    ItEpicResponse,
    ItEpicUpdate,
    ItIssueCommentCreate,
    ItIssueCommentResponse,
    ItIssueCreate,
    ItIssueMove,
    ItIssueResponse,
    ItIssueShort,
    ItIssueUpdate,
    ItMemberAdd,
    ItMemberResponse,
    ItMemberShort,
    ItMemberUpdate,
    ItProjectCreate,
    ItProjectDetailResponse,
    ItProjectResponse,
    ItProjectUpdate,
    ItSprintCreate,
    ItSprintResponse,
    ItSprintUpdate,
)

router = APIRouter()

# Роли, которым доступ нельзя ни открыть, ни закрыть
_ALWAYS_ACCESS_ROLES = {UserRole.OWNER.value, UserRole.ADMIN.value}
_NEVER_ACCESS_ROLES = {UserRole.PARENT.value, UserRole.GUEST.value}

BOARD_COLUMNS = [
    ("todo", "В очереди"),
    ("in_progress", "В работе"),
    ("review", "На проверке"),
    ("done", "Готово"),
]


# ─── helpers ────────────────────────────────────────────────────────────────

def _check_agile_access(user: User, db: Session, require_manage: bool = False) -> None:
    """Проверяет, есть ли у пользователя доступ к Agile-модулю."""
    effective_role = auth.resolve_effective_role(user).value

    if effective_role in _ALWAYS_ACCESS_ROLES:
        return

    if effective_role in _NEVER_ACCESS_ROLES:
        raise HTTPException(status_code=403, detail="Нет доступа к Agile-трекеру")

    row = db.query(AgileRoleAccess).filter(AgileRoleAccess.role == effective_role).first()
    if not row or not row.enabled:
        raise HTTPException(status_code=403, detail="Agile-трекер отключён для вашей роли")

    if require_manage and row.access_level != "manage":
        raise HTTPException(status_code=403, detail="Нет прав на управление в Agile-трекере")


def _require_access(db: Session = Depends(get_db), current_user: User = Depends(auth.get_current_active_user)):
    _check_agile_access(current_user, db, require_manage=False)
    return current_user


def _require_manage(db: Session = Depends(get_db), current_user: User = Depends(auth.get_current_active_user)):
    role = auth.resolve_effective_role(current_user).value
    if role in _ALWAYS_ACCESS_ROLES:
        return current_user
    _check_agile_access(current_user, db, require_manage=True)
    return current_user


def _require_admin(current_user: User = Depends(auth.get_current_active_user)):
    auth.ensure_permission(current_user, "agile.admin")
    return current_user


def _get_project_or_404(project_id: int, db: Session) -> ItProject:
    p = db.query(ItProject).filter(ItProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return p


def _is_project_member(project_id: int, user_id: int, db: Session) -> bool:
    return db.query(ItProjectMember).filter(
        ItProjectMember.project_id == project_id,
        ItProjectMember.user_id == user_id,
    ).first() is not None


def _assert_project_access(project: ItProject, user: User, db: Session) -> None:
    role = auth.resolve_effective_role(user).value
    if role in _ALWAYS_ACCESS_ROLES:
        return
    if project.visibility == "internal" and _is_project_member(project.id, user.id, db):
        return
    if project.owner_id == user.id:
        return
    raise HTTPException(status_code=403, detail="Нет доступа к проекту")


def _next_issue_number(project_id: int, db: Session) -> int:
    max_num = db.query(func.max(ItIssue.number)).filter(ItIssue.project_id == project_id).scalar()
    return (max_num or 0) + 1


def _issue_to_short(issue: ItIssue) -> ItIssueShort:
    checklist_total = len(issue.checklist) if issue.checklist else 0
    checklist_done = sum(1 for c in (issue.checklist or []) if c.completed)
    return ItIssueShort(
        id=issue.id,
        project_id=issue.project_id,
        number=issue.number,
        type=issue.type,
        title=issue.title,
        status=issue.status,
        priority=issue.priority,
        story_points=issue.story_points,
        assignee_id=issue.assignee_id,
        assignee_name=issue.assignee.full_name if issue.assignee else None,
        epic_id=issue.epic_id,
        epic_title=issue.epic.title if issue.epic else None,
        epic_color=issue.epic.color if issue.epic else None,
        sprint_id=issue.sprint_id,
        labels=issue.labels,
        checklist_total=checklist_total,
        checklist_done=checklist_done,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
    )


def _issue_to_full(issue: ItIssue) -> ItIssueResponse:
    short = _issue_to_short(issue)
    checklist = [
        ItChecklistItemResponse(
            id=c.id, issue_id=c.issue_id, text=c.text,
            completed=c.completed, assignee_id=c.assignee_id, order=c.order,
        )
        for c in (issue.checklist or [])
    ]
    comments = [
        ItIssueCommentResponse(
            id=cm.id, issue_id=cm.issue_id, author_id=cm.author_id,
            author_name=cm.author.full_name if cm.author else None,
            text=cm.text, created_at=cm.created_at, updated_at=cm.updated_at,
        )
        for cm in sorted(issue.comments or [], key=lambda x: x.created_at)
    ]
    return ItIssueResponse(
        **short.model_dump(),
        description=issue.description,
        reporter_id=issue.reporter_id,
        reporter_name=issue.reporter.full_name if issue.reporter else None,
        due_date=issue.due_date,
        checklist=checklist,
        comments=comments,
    )


def _sprint_to_response(sprint: ItSprint, db: Session) -> ItSprintResponse:
    issues = db.query(ItIssue).filter(ItIssue.sprint_id == sprint.id).all()
    total_points = sum(i.story_points or 0 for i in issues)
    done_points = sum(i.story_points or 0 for i in issues if i.status == "done")
    return ItSprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        goal=sprint.goal,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        status=sprint.status,
        total_points=total_points,
        done_points=done_points,
        issue_count=len(issues),
        created_at=sprint.created_at,
        updated_at=sprint.updated_at,
    )


def _epic_to_response(epic: ItEpic, db: Session) -> ItEpicResponse:
    issues = db.query(ItIssue).filter(ItIssue.epic_id == epic.id).all()
    done_count = sum(1 for i in issues if i.status == "done")
    return ItEpicResponse(
        id=epic.id,
        project_id=epic.project_id,
        title=epic.title,
        description=epic.description,
        color=epic.color,
        start_date=epic.start_date,
        end_date=epic.end_date,
        status=epic.status,
        position=epic.position,
        issue_count=len(issues),
        done_count=done_count,
        created_at=epic.created_at,
        updated_at=epic.updated_at,
    )


def _project_to_response(project: ItProject, db: Session) -> ItProjectResponse:
    member_count = db.query(ItProjectMember).filter(ItProjectMember.project_id == project.id).count()
    issue_count = db.query(ItIssue).filter(ItIssue.project_id == project.id).count()
    active_sprint = db.query(ItSprint).filter(
        ItSprint.project_id == project.id,
        ItSprint.status == "active",
    ).first()
    return ItProjectResponse(
        id=project.id,
        name=project.name,
        key=project.key,
        description=project.description,
        owner_id=project.owner_id,
        status=project.status,
        visibility=project.visibility,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=member_count,
        issue_count=issue_count,
        open_sprint_name=active_sprint.name if active_sprint else None,
    )


def _load_issues(project_id: int, db: Session):
    return (
        db.query(ItIssue)
        .options(
            joinedload(ItIssue.assignee),
            joinedload(ItIssue.reporter),
            joinedload(ItIssue.epic),
            joinedload(ItIssue.checklist),
            joinedload(ItIssue.comments).joinedload(ItIssueComment.author),
        )
        .filter(ItIssue.project_id == project_id)
    )


# ─── Доступ по ролям ────────────────────────────────────────────────────────

@router.get("/role-access", response_model=AgileRoleAccessResponse)
async def get_role_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    configurable_roles = [
        r.value for r in UserRole
        if r.value not in _ALWAYS_ACCESS_ROLES and r.value not in _NEVER_ACCESS_ROLES
    ]
    rows = {r.role: r for r in db.query(AgileRoleAccess).all()}
    items = []
    for role in configurable_roles:
        row = rows.get(role)
        items.append(AgileRoleAccessItem(
            role=role,
            enabled=row.enabled if row else False,
            access_level=row.access_level if row else "access",
        ))
    return AgileRoleAccessResponse(items=items)


@router.patch("/role-access", response_model=AgileRoleAccessItem)
async def update_role_access(
    body: AgileRoleAccessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    if body.role in _ALWAYS_ACCESS_ROLES or body.role in _NEVER_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="Нельзя изменить доступ для этой роли")
    row = db.query(AgileRoleAccess).filter(AgileRoleAccess.role == body.role).first()
    if not row:
        row = AgileRoleAccess(role=body.role, updated_by_id=current_user.id)
        db.add(row)
    row.enabled = body.enabled
    row.access_level = body.access_level
    row.updated_by_id = current_user.id
    db.commit()
    db.refresh(row)
    return AgileRoleAccessItem(role=row.role, enabled=row.enabled, access_level=row.access_level)


# ─── Проекты ────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[ItProjectResponse])
async def list_projects(
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    q = db.query(ItProject)
    if status_filter:
        q = q.filter(ItProject.status == status_filter)
    else:
        q = q.filter(ItProject.status == "active")
    projects = q.order_by(ItProject.created_at.desc()).all()

    role = auth.resolve_effective_role(current_user).value
    if role not in _ALWAYS_ACCESS_ROLES:
        member_project_ids = {
            m.project_id for m in
            db.query(ItProjectMember).filter(ItProjectMember.user_id == current_user.id).all()
        }
        projects = [p for p in projects if p.id in member_project_ids or p.owner_id == current_user.id]

    return [_project_to_response(p, db) for p in projects]


@router.post("/projects", response_model=ItProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ItProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    existing = db.query(ItProject).filter(ItProject.key == body.key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ключ проекта '{body.key}' уже занят")
    project = ItProject(
        name=body.name,
        key=body.key,
        description=body.description,
        visibility=body.visibility,
        owner_id=current_user.id,
        status="active",
    )
    db.add(project)
    db.flush()
    db.add(ItProjectMember(project_id=project.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(project)
    return _project_to_response(project, db)


@router.get("/projects/{project_id}", response_model=ItProjectDetailResponse)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    members = db.query(ItProjectMember).options(joinedload(ItProjectMember.user)).filter(
        ItProjectMember.project_id == project_id
    ).all()
    base = _project_to_response(project, db)
    return ItProjectDetailResponse(
        **base.model_dump(),
        members=[ItMemberShort(
            id=m.user.id, full_name=m.user.full_name,
            email=m.user.email, role=m.role,
        ) for m in members],
    )


@router.patch("/projects/{project_id}", response_model=ItProjectResponse)
async def update_project(
    project_id: int,
    body: ItProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _project_to_response(project, db)


# ─── Участники проекта ──────────────────────────────────────────────────────

@router.get("/projects/{project_id}/members", response_model=List[ItMemberResponse])
async def list_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    members = db.query(ItProjectMember).options(joinedload(ItProjectMember.user)).filter(
        ItProjectMember.project_id == project_id
    ).all()
    return [
        ItMemberResponse(
            id=m.id, project_id=m.project_id, user_id=m.user_id,
            role=m.role, joined_at=m.joined_at,
            user=ItMemberShort(
                id=m.user.id, full_name=m.user.full_name,
                email=m.user.email, role=m.role,
            ),
        ) for m in members
    ]


@router.post("/projects/{project_id}/members", response_model=ItMemberResponse, status_code=201)
async def add_member(
    project_id: int,
    body: ItMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    if _is_project_member(project_id, body.user_id, db):
        raise HTTPException(status_code=400, detail="Пользователь уже участник проекта")
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    m = ItProjectMember(project_id=project_id, user_id=body.user_id, role=body.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return ItMemberResponse(
        id=m.id, project_id=m.project_id, user_id=m.user_id,
        role=m.role, joined_at=m.joined_at,
        user=ItMemberShort(id=user.id, full_name=user.full_name, email=user.email, role=m.role),
    )


@router.patch("/projects/{project_id}/members/{user_id}", response_model=ItMemberResponse)
async def update_member(
    project_id: int,
    user_id: int,
    body: ItMemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    m = db.query(ItProjectMember).options(joinedload(ItProjectMember.user)).filter(
        ItProjectMember.project_id == project_id,
        ItProjectMember.user_id == user_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Участник не найден")
    m.role = body.role
    db.commit()
    db.refresh(m)
    return ItMemberResponse(
        id=m.id, project_id=m.project_id, user_id=m.user_id,
        role=m.role, joined_at=m.joined_at,
        user=ItMemberShort(id=m.user.id, full_name=m.user.full_name, email=m.user.email, role=m.role),
    )


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    project = _get_project_or_404(project_id, db)
    if project.owner_id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить владельца проекта")
    m = db.query(ItProjectMember).filter(
        ItProjectMember.project_id == project_id,
        ItProjectMember.user_id == user_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Участник не найден")
    db.delete(m)
    db.commit()


# ─── Эпики ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/epics", response_model=List[ItEpicResponse])
async def list_epics(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    epics = db.query(ItEpic).filter(ItEpic.project_id == project_id).order_by(ItEpic.position).all()
    return [_epic_to_response(e, db) for e in epics]


@router.post("/projects/{project_id}/epics", response_model=ItEpicResponse, status_code=201)
async def create_epic(
    project_id: int,
    body: ItEpicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    _get_project_or_404(project_id, db)
    max_pos = db.query(func.max(ItEpic.position)).filter(ItEpic.project_id == project_id).scalar() or 0
    epic = ItEpic(
        project_id=project_id,
        title=body.title,
        description=body.description,
        color=body.color,
        start_date=body.start_date,
        end_date=body.end_date,
        status="open",
        position=max_pos + 1,
    )
    db.add(epic)
    db.commit()
    db.refresh(epic)
    return _epic_to_response(epic, db)


@router.patch("/projects/{project_id}/epics/{epic_id}", response_model=ItEpicResponse)
async def update_epic(
    project_id: int,
    epic_id: int,
    body: ItEpicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    epic = db.query(ItEpic).filter(ItEpic.id == epic_id, ItEpic.project_id == project_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Эпик не найден")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(epic, field, value)
    db.commit()
    db.refresh(epic)
    return _epic_to_response(epic, db)


@router.delete("/projects/{project_id}/epics/{epic_id}", status_code=204)
async def delete_epic(
    project_id: int,
    epic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    epic = db.query(ItEpic).filter(ItEpic.id == epic_id, ItEpic.project_id == project_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Эпик не найден")
    db.query(ItIssue).filter(ItIssue.epic_id == epic_id).update({"epic_id": None})
    db.delete(epic)
    db.commit()


# ─── Спринты ────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/sprints", response_model=List[ItSprintResponse])
async def list_sprints(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    sprints = db.query(ItSprint).filter(ItSprint.project_id == project_id).order_by(ItSprint.created_at).all()
    return [_sprint_to_response(s, db) for s in sprints]


@router.post("/projects/{project_id}/sprints", response_model=ItSprintResponse, status_code=201)
async def create_sprint(
    project_id: int,
    body: ItSprintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    _get_project_or_404(project_id, db)
    sprint = ItSprint(
        project_id=project_id,
        name=body.name,
        goal=body.goal,
        start_date=body.start_date,
        end_date=body.end_date,
        status="planning",
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)
    return _sprint_to_response(sprint, db)


@router.patch("/projects/{project_id}/sprints/{sprint_id}", response_model=ItSprintResponse)
async def update_sprint(
    project_id: int,
    sprint_id: int,
    body: ItSprintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    sprint = db.query(ItSprint).filter(ItSprint.id == sprint_id, ItSprint.project_id == project_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Спринт не найден")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sprint, field, value)
    db.commit()
    db.refresh(sprint)
    return _sprint_to_response(sprint, db)


@router.patch("/projects/{project_id}/sprints/{sprint_id}/start", response_model=ItSprintResponse)
async def start_sprint(
    project_id: int,
    sprint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    sprint = db.query(ItSprint).filter(ItSprint.id == sprint_id, ItSprint.project_id == project_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Спринт не найден")
    if sprint.status != "planning":
        raise HTTPException(status_code=400, detail="Запустить можно только спринт в статусе 'Планирование'")
    active = db.query(ItSprint).filter(
        ItSprint.project_id == project_id,
        ItSprint.status == "active",
        ItSprint.id != sprint_id,
    ).first()
    if active:
        raise HTTPException(status_code=400, detail=f"Уже есть активный спринт: {active.name}")
    sprint.status = "active"
    db.commit()
    db.refresh(sprint)
    return _sprint_to_response(sprint, db)


@router.patch("/projects/{project_id}/sprints/{sprint_id}/complete", response_model=ItSprintResponse)
async def complete_sprint(
    project_id: int,
    sprint_id: int,
    move_to_backlog: bool = Query(True, description="Перенести незакрытые задачи в бэклог"),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    sprint = db.query(ItSprint).filter(ItSprint.id == sprint_id, ItSprint.project_id == project_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Спринт не найден")
    if sprint.status != "active":
        raise HTTPException(status_code=400, detail="Завершить можно только активный спринт")
    if move_to_backlog:
        db.query(ItIssue).filter(
            ItIssue.sprint_id == sprint_id,
            ItIssue.status != "done",
        ).update({"sprint_id": None})
    sprint.status = "completed"
    db.commit()
    db.refresh(sprint)
    return _sprint_to_response(sprint, db)


# ─── Задачи (Issues) ────────────────────────────────────────────────────────

def _base_issue_query(project_id: int, db: Session):
    return (
        db.query(ItIssue)
        .options(
            joinedload(ItIssue.assignee),
            joinedload(ItIssue.reporter),
            joinedload(ItIssue.epic),
            joinedload(ItIssue.checklist),
            joinedload(ItIssue.comments).joinedload(ItIssueComment.author),
        )
        .filter(ItIssue.project_id == project_id)
    )


@router.get("/projects/{project_id}/board", response_model=ItBoardResponse)
async def get_board(
    project_id: int,
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)

    sprint = None
    if sprint_id:
        sprint = db.query(ItSprint).filter(ItSprint.id == sprint_id, ItSprint.project_id == project_id).first()
    else:
        sprint = db.query(ItSprint).filter(
            ItSprint.project_id == project_id,
            ItSprint.status == "active",
        ).first()

    q = _base_issue_query(project_id, db)
    if sprint:
        q = q.filter(ItIssue.sprint_id == sprint.id)
    else:
        q = q.filter(ItIssue.sprint_id.is_(None))

    issues = q.order_by(ItIssue.position).all()
    columns = []
    for col_status, col_label in BOARD_COLUMNS:
        col_issues = [_issue_to_short(i) for i in issues if i.status == col_status]
        columns.append(ItBoardColumn(status=col_status, label=col_label, issues=col_issues))

    return ItBoardResponse(
        sprint=_sprint_to_response(sprint, db) if sprint else None,
        columns=columns,
    )


@router.get("/projects/{project_id}/backlog", response_model=ItBacklogResponse)
async def get_backlog(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)

    issues = (
        _base_issue_query(project_id, db)
        .filter(ItIssue.sprint_id.is_(None), ItIssue.status != "done")
        .order_by(ItIssue.position, ItIssue.created_at)
        .all()
    )

    epics = {e.id: e for e in db.query(ItEpic).filter(ItEpic.project_id == project_id).all()}
    groups_map: dict = {}
    no_epic = []

    for issue in issues:
        if issue.epic_id:
            groups_map.setdefault(issue.epic_id, []).append(issue)
        else:
            no_epic.append(issue)

    groups = []
    for epic_id, epic_issues in groups_map.items():
        epic = epics.get(epic_id)
        groups.append(ItBacklogGroup(
            epic_id=epic_id,
            epic_title=epic.title if epic else None,
            epic_color=epic.color if epic else None,
            issues=[_issue_to_short(i) for i in epic_issues],
        ))
    if no_epic:
        groups.append(ItBacklogGroup(epic_id=None, epic_title=None, epic_color=None, issues=[_issue_to_short(i) for i in no_epic]))

    return ItBacklogResponse(groups=groups, total=len(issues))


@router.get("/projects/{project_id}/issues", response_model=List[ItIssueShort])
async def list_issues(
    project_id: int,
    sprint_id: Optional[int] = Query(None),
    epic_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    q = _base_issue_query(project_id, db)
    if sprint_id is not None:
        q = q.filter(ItIssue.sprint_id == sprint_id)
    if epic_id is not None:
        q = q.filter(ItIssue.epic_id == epic_id)
    if status_filter:
        q = q.filter(ItIssue.status == status_filter)
    if assignee_id is not None:
        q = q.filter(ItIssue.assignee_id == assignee_id)
    issues = q.order_by(ItIssue.position, ItIssue.created_at.desc()).all()
    return [_issue_to_short(i) for i in issues]


@router.post("/projects/{project_id}/issues", response_model=ItIssueResponse, status_code=201)
async def create_issue(
    project_id: int,
    body: ItIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    _get_project_or_404(project_id, db)
    number = _next_issue_number(project_id, db)
    max_pos = db.query(func.max(ItIssue.position)).filter(ItIssue.project_id == project_id).scalar() or 0
    issue = ItIssue(
        project_id=project_id,
        number=number,
        type=body.type,
        title=body.title,
        description=body.description,
        status="todo",
        priority=body.priority,
        epic_id=body.epic_id,
        sprint_id=body.sprint_id,
        assignee_id=body.assignee_id,
        story_points=body.story_points,
        reporter_id=current_user.id,
        due_date=body.due_date,
        labels=body.labels,
        position=max_pos + 1,
    )
    db.add(issue)
    db.commit()
    issue = (
        _base_issue_query(project_id, db)
        .filter(ItIssue.id == issue.id)
        .first()
    )
    return _issue_to_full(issue)


@router.get("/projects/{project_id}/issues/{issue_id}", response_model=ItIssueResponse)
async def get_issue(
    project_id: int,
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)
    issue = _base_issue_query(project_id, db).filter(ItIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return _issue_to_full(issue)


@router.patch("/projects/{project_id}/issues/{issue_id}", response_model=ItIssueResponse)
async def update_issue(
    project_id: int,
    issue_id: int,
    body: ItIssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    issue = db.query(ItIssue).filter(ItIssue.id == issue_id, ItIssue.project_id == project_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(issue, field, value)
    db.commit()
    issue = _base_issue_query(project_id, db).filter(ItIssue.id == issue_id).first()
    return _issue_to_full(issue)


@router.patch("/projects/{project_id}/issues/{issue_id}/move", response_model=ItIssueResponse)
async def move_issue(
    project_id: int,
    issue_id: int,
    body: ItIssueMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    issue = db.query(ItIssue).filter(ItIssue.id == issue_id, ItIssue.project_id == project_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    issue.status = body.status
    if body.position is not None:
        issue.position = body.position
    if body.sprint_id is not None:
        issue.sprint_id = body.sprint_id
    db.commit()
    issue = _base_issue_query(project_id, db).filter(ItIssue.id == issue_id).first()
    return _issue_to_full(issue)


@router.delete("/projects/{project_id}/issues/{issue_id}", status_code=204)
async def delete_issue(
    project_id: int,
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_manage),
):
    issue = db.query(ItIssue).filter(ItIssue.id == issue_id, ItIssue.project_id == project_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    db.delete(issue)
    db.commit()


# ─── Чеклист ────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/issues/{issue_id}/checklist", response_model=ItChecklistItemResponse, status_code=201)
async def add_checklist_item(
    project_id: int,
    issue_id: int,
    body: ItChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    issue = db.query(ItIssue).filter(ItIssue.id == issue_id, ItIssue.project_id == project_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    max_order = db.query(func.max(ItChecklistItem.order)).filter(ItChecklistItem.issue_id == issue_id).scalar() or 0
    item = ItChecklistItem(
        issue_id=issue_id, text=body.text,
        assignee_id=body.assignee_id, order=max_order + 1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ItChecklistItemResponse(id=item.id, issue_id=item.issue_id, text=item.text, completed=item.completed, assignee_id=item.assignee_id, order=item.order)


@router.patch("/projects/{project_id}/issues/{issue_id}/checklist/{item_id}", response_model=ItChecklistItemResponse)
async def update_checklist_item(
    project_id: int,
    issue_id: int,
    item_id: int,
    body: ItChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    item = db.query(ItChecklistItem).filter(ItChecklistItem.id == item_id, ItChecklistItem.issue_id == issue_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт не найден")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return ItChecklistItemResponse(id=item.id, issue_id=item.issue_id, text=item.text, completed=item.completed, assignee_id=item.assignee_id, order=item.order)


@router.delete("/projects/{project_id}/issues/{issue_id}/checklist/{item_id}", status_code=204)
async def delete_checklist_item(
    project_id: int,
    issue_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    item = db.query(ItChecklistItem).filter(ItChecklistItem.id == item_id, ItChecklistItem.issue_id == issue_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт не найден")
    db.delete(item)
    db.commit()


# ─── Комментарии ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/issues/{issue_id}/comments", response_model=ItIssueCommentResponse, status_code=201)
async def add_comment(
    project_id: int,
    issue_id: int,
    body: ItIssueCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    issue = db.query(ItIssue).filter(ItIssue.id == issue_id, ItIssue.project_id == project_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    comment = ItIssueComment(issue_id=issue_id, author_id=current_user.id, text=body.text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return ItIssueCommentResponse(
        id=comment.id, issue_id=comment.issue_id, author_id=comment.author_id,
        author_name=current_user.full_name, text=comment.text,
        created_at=comment.created_at, updated_at=comment.updated_at,
    )


@router.delete("/projects/{project_id}/issues/{issue_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    project_id: int,
    issue_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    comment = db.query(ItIssueComment).filter(
        ItIssueComment.id == comment_id,
        ItIssueComment.issue_id == issue_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    role = auth.resolve_effective_role(current_user).value
    if comment.author_id != current_user.id and role not in _ALWAYS_ACCESS_ROLES:
        raise HTTPException(status_code=403, detail="Можно удалять только свои комментарии")
    db.delete(comment)
    db.commit()


# ─── Аналитика ──────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/analytics", response_model=ItAnalyticsResponse)
async def get_analytics(
    project_id: int,
    sprint_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_access),
):
    project = _get_project_or_404(project_id, db)
    _assert_project_access(project, current_user, db)

    sprint = None
    if sprint_id:
        sprint = db.query(ItSprint).filter(ItSprint.id == sprint_id, ItSprint.project_id == project_id).first()
    else:
        sprint = db.query(ItSprint).filter(
            ItSprint.project_id == project_id,
            ItSprint.status.in_(["active", "completed"]),
        ).order_by(ItSprint.created_at.desc()).first()

    issues_q = db.query(ItIssue).filter(ItIssue.project_id == project_id)
    if sprint:
        issues_q = issues_q.filter(ItIssue.sprint_id == sprint.id)
    issues = issues_q.all()

    # Burndown
    burndown: List[BurndownPoint] = []
    if sprint and sprint.start_date and sprint.end_date:
        total_points = sum(i.story_points or 1 for i in issues)
        days = (sprint.end_date - sprint.start_date).days + 1
        for day_offset in range(days):
            day = sprint.start_date + timedelta(days=day_offset)
            planned = int(total_points * (1 - day_offset / max(days - 1, 1)))
            done_on_day = sum(
                i.story_points or 1 for i in issues
                if i.status == "done" and i.updated_at and i.updated_at.date() <= day
            )
            actual = max(0, total_points - done_on_day) if day <= date.today() else None
            burndown.append(BurndownPoint(date=day, planned=planned, actual=actual))

    # Velocity по последним спринтам
    completed_sprints = db.query(ItSprint).filter(
        ItSprint.project_id == project_id,
        ItSprint.status == "completed",
    ).order_by(ItSprint.created_at.desc()).limit(6).all()
    velocity = []
    for s in reversed(completed_sprints):
        sp_issues = db.query(ItIssue).filter(ItIssue.sprint_id == s.id).all()
        done_pts = sum(i.story_points or 0 for i in sp_issues if i.status == "done")
        velocity.append({"sprint": s.name, "done_points": done_pts})

    # По типам
    by_type: dict = {}
    for i in issues:
        by_type[i.type] = by_type.get(i.type, 0) + 1

    # По приоритетам
    by_priority: dict = {}
    for i in issues:
        by_priority[i.priority] = by_priority.get(i.priority, 0) + 1

    # Среднее время в работе
    done_issues = [i for i in issues if i.status == "done" and i.created_at and i.updated_at]
    cycle_time = None
    if done_issues:
        total_days = sum((i.updated_at - i.created_at).total_seconds() / 86400 for i in done_issues)
        cycle_time = round(total_days / len(done_issues), 1)

    return ItAnalyticsResponse(
        sprint=_sprint_to_response(sprint, db) if sprint else None,
        burndown=burndown,
        velocity=velocity,
        by_type=by_type,
        by_priority=by_priority,
        cycle_time_avg_days=cycle_time,
    )
