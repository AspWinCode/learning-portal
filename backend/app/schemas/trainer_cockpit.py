from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.owner_dashboard import StudentLearningAIInsightResponse


class TrainerCockpitTodoGradeItem(BaseModel):
    student_id: int
    student_name: str
    group_name: Optional[str] = None
    last_lesson_date: date
    lessons_without_grade_count: int


class TrainerCockpitDraftCharacteristicItem(BaseModel):
    characteristic_id: int
    student_id: int
    student_name: str
    month: int
    year: int
    created_at: datetime


class TrainerCockpitStudentProgressItem(BaseModel):
    student_id: int
    student_name: str
    group_name: Optional[str] = None
    program_name: Optional[str] = None
    progress_percent: float
    graded_topics: int
    total_topics: int
    ai_insight: Optional[StudentLearningAIInsightResponse] = None


class TrainerCockpitNotificationItem(BaseModel):
    notification_type: str
    status: str
    title: str
    description: str
    created_at: datetime


class TrainerCockpitSummaryResponse(BaseModel):
    todo_grade_items: List[TrainerCockpitTodoGradeItem]
    draft_characteristics: List[TrainerCockpitDraftCharacteristicItem]
    my_students: List[TrainerCockpitStudentProgressItem]
    characteristic_notifications: List[TrainerCockpitNotificationItem]
    substitution_notifications: List[TrainerCockpitNotificationItem]


__all__ = [name for name in globals() if not name.startswith("_")]
