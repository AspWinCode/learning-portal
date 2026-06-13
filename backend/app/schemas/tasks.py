from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class TaskTemplateSubtaskResponse(BaseModel):
    id: int
    template_id: int
    text: str
    order: int

    model_config = ConfigDict(from_attributes=True)


class TaskTemplateCreate(BaseModel):
    name: str
    subtasks: Optional[List[dict]] = None
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = False
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subtasks: Optional[List[dict]] = None
    student_ids: Optional[List[int]] = None
    repeat_enabled: Optional[bool] = None
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskTemplateResponse(BaseModel):
    id: int
    name: str
    created_by_id: int
    created_at: datetime
    subtasks: List[TaskTemplateSubtaskResponse]
    student_ids: List[int]
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[str] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class TaskSubtaskResponse(BaseModel):
    id: int
    task_id: int
    text: str
    completed: bool
    order: int

    model_config = ConfigDict(from_attributes=True)


class TaskCountersResponse(BaseModel):
    parent_replies: int = 0
    parent_escalations: int = 0
    parent_to_management: int = 0


class TaskSubtaskUpdate(BaseModel):
    completed: Optional[bool] = None


class TaskCreate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    template_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    category: Optional[Literal["schools", "parents", "leads"]] = None
    subtasks: Optional[List[dict]] = None
    student_ids: Optional[List[int]] = None
    tags: Optional[List[str]] = None
    scheduled_for: Optional[date] = None
    due_at: Optional[datetime] = None
    priority: Optional[Literal["low", "normal", "high"]] = None
    pinned_today: Optional[bool] = None
    repeat_enabled: Optional[bool] = False
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskAiBreakdownRequest(BaseModel):
    text: str
    category: Optional[Literal["schools", "parents", "leads"]] = "schools"


class TaskAiBreakdownResponse(BaseModel):
    title: str
    description: Optional[str] = None
    category: Literal["schools", "parents", "leads"] = "schools"
    priority: Literal["low", "normal", "high"] = "normal"
    subtasks: List[dict]
    provider: Literal["claude", "rules"] = "rules"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[int] = None
    category: Optional[Literal["schools", "parents", "leads"]] = None
    student_ids: Optional[List[int]] = None
    tags: Optional[List[str]] = None
    scheduled_for: Optional[date] = None
    due_at: Optional[datetime] = None
    priority: Optional[Literal["low", "normal", "high"]] = None
    pinned_today: Optional[bool] = None
    repeat_enabled: Optional[bool] = None
    repeat_frequency: Optional[Literal["daily", "weekly", "monthly"]] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[Literal["never", "after_count", "until_date"]] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    template_id: Optional[int] = None
    created_by_id: int
    assigned_to_id: Optional[int] = None
    category: str = "schools"
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    scheduled_for: Optional[date] = None
    due_at: Optional[datetime] = None
    priority: str = "normal"
    pinned_today: bool = False
    tags: Optional[List[str]] = None
    task_kind: Optional[str] = None
    reminder_stage: Optional[int] = None
    counters: Optional[TaskCountersResponse] = None
    subtasks: List[TaskSubtaskResponse]
    student_ids: List[int]
    assigned_to_name: Optional[str] = None
    created_by_name: Optional[str] = None
    students: Optional[List[dict]] = None
    progress: float
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_days: Optional[List[int]] = None
    repeat_end_type: Optional[str] = None
    repeat_end_after_count: Optional[int] = None
    repeat_end_until: Optional[date] = None
    payment_state: Optional[Literal["unpaid", "paid", "unknown"]] = None
    payment_days_overdue: Optional[int] = None
    payment_next_date: Optional[date] = None
    payment_parent_name: Optional[str] = None
    payment_balance: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class TaskDayStatsResponse(BaseModel):
    date: date
    completed_count: int


class TaskDayDeskStats(BaseModel):
    overdue: int
    today: int
    completed_today: int
    overload: int


class TaskDayDeskResponse(BaseModel):
    stats: TaskDayDeskStats
    urgent: List[TaskResponse]
    parents: List[TaskResponse]
    makeups: List[TaskResponse]
    payments: List[TaskResponse]
    operations: List[TaskResponse]
    leads: List[TaskResponse]


class TaskCounterIncrement(BaseModel):
    key: str
    delta: Optional[int] = 1


class ParentResponsesStat(BaseModel):
    date: date
    user_id: int
    user_name: str
    replies: int
    escalations: int


__all__ = [name for name in globals() if not name.startswith("_")]
