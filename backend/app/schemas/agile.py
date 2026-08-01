"""Pydantic-схемы для Agile-трекера IT-проектов."""
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ── Участники проекта ──────────────────────────────────────────

class ItMemberShort(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    model_config = ConfigDict(from_attributes=True)


# ── Проект ────────────────────────────────────────────────────

class ItProjectCreate(BaseModel):
    name: str
    key: str
    description: Optional[str] = None
    visibility: str = "internal"

    @field_validator("key")
    @classmethod
    def key_uppercase(cls, v: str) -> str:
        return v.strip().upper()[:10]


class ItProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None


class ItProjectResponse(BaseModel):
    id: int
    name: str
    key: str
    description: Optional[str] = None
    owner_id: int
    status: str
    visibility: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    member_count: Optional[int] = None
    issue_count: Optional[int] = None
    open_sprint_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ItProjectDetailResponse(ItProjectResponse):
    members: List[ItMemberShort] = []


# ── Участники ─────────────────────────────────────────────────

class ItMemberAdd(BaseModel):
    user_id: int
    role: str = "member"


class ItMemberUpdate(BaseModel):
    role: str


class ItMemberResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    role: str
    joined_at: datetime
    user: ItMemberShort

    model_config = ConfigDict(from_attributes=True)


# ── Эпик ──────────────────────────────────────────────────────

class ItEpicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    color: str = "#7c3aed"
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ItEpicUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    position: Optional[int] = None


class ItEpicResponse(BaseModel):
    id: int
    project_id: int
    title: str
    description: Optional[str] = None
    color: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str
    position: int
    issue_count: Optional[int] = None
    done_count: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Спринт ────────────────────────────────────────────────────

class ItSprintCreate(BaseModel):
    name: str
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ItSprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None


class ItSprintResponse(BaseModel):
    id: int
    project_id: int
    name: str
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str
    total_points: Optional[int] = None
    done_points: Optional[int] = None
    issue_count: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Задача (Issue) ────────────────────────────────────────────

class ItChecklistItemCreate(BaseModel):
    text: str
    assignee_id: Optional[int] = None


class ItChecklistItemUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None
    assignee_id: Optional[int] = None
    order: Optional[int] = None


class ItChecklistItemResponse(BaseModel):
    id: int
    issue_id: int
    text: str
    completed: bool
    assignee_id: Optional[int] = None
    order: int

    model_config = ConfigDict(from_attributes=True)


class ItIssueCommentCreate(BaseModel):
    text: str


class ItIssueCommentResponse(BaseModel):
    id: int
    issue_id: int
    author_id: int
    author_name: Optional[str] = None
    text: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ItIssueCreate(BaseModel):
    title: str
    description: Optional[str] = None
    type: str = "task"
    priority: str = "medium"
    epic_id: Optional[int] = None
    sprint_id: Optional[int] = None
    assignee_id: Optional[int] = None
    story_points: Optional[int] = None
    due_date: Optional[date] = None
    labels: Optional[List[str]] = None


class ItIssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    epic_id: Optional[int] = None
    sprint_id: Optional[int] = None
    assignee_id: Optional[int] = None
    story_points: Optional[int] = None
    due_date: Optional[date] = None
    labels: Optional[List[str]] = None
    position: Optional[int] = None


class ItIssueMove(BaseModel):
    status: str
    position: Optional[int] = None
    sprint_id: Optional[int] = None


class ItIssueShort(BaseModel):
    id: int
    project_id: int
    number: int
    type: str
    title: str
    status: str
    priority: str
    story_points: Optional[int] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    epic_id: Optional[int] = None
    epic_title: Optional[str] = None
    epic_color: Optional[str] = None
    sprint_id: Optional[int] = None
    labels: Optional[List[str]] = None
    checklist_total: int = 0
    checklist_done: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ItIssueResponse(ItIssueShort):
    description: Optional[str] = None
    reporter_id: int
    reporter_name: Optional[str] = None
    due_date: Optional[date] = None
    checklist: List[ItChecklistItemResponse] = []
    comments: List[ItIssueCommentResponse] = []


# ── Доска (Board) ─────────────────────────────────────────────

class ItBoardColumn(BaseModel):
    status: str
    label: str
    issues: List[ItIssueShort] = []


class ItBoardResponse(BaseModel):
    sprint: Optional[ItSprintResponse] = None
    columns: List[ItBoardColumn] = []


# ── Бэклог ────────────────────────────────────────────────────

class ItBacklogGroup(BaseModel):
    epic_id: Optional[int] = None
    epic_title: Optional[str] = None
    epic_color: Optional[str] = None
    issues: List[ItIssueShort] = []


class ItBacklogResponse(BaseModel):
    groups: List[ItBacklogGroup] = []
    total: int = 0


# ── Аналитика ─────────────────────────────────────────────────

class BurndownPoint(BaseModel):
    date: date
    planned: int
    actual: Optional[int] = None


class ItAnalyticsResponse(BaseModel):
    sprint: Optional[ItSprintResponse] = None
    burndown: List[BurndownPoint] = []
    velocity: List[dict] = []
    by_type: dict = {}
    by_priority: dict = {}
    cycle_time_avg_days: Optional[float] = None


# ── Настройки доступа по ролям ────────────────────────────────

class AgileRoleAccessItem(BaseModel):
    role: str
    enabled: bool
    access_level: str


class AgileRoleAccessUpdate(BaseModel):
    role: str
    enabled: bool
    access_level: str = "access"


class AgileRoleAccessResponse(BaseModel):
    items: List[AgileRoleAccessItem]


__all__ = [name for name in globals() if not name.startswith("_")]
