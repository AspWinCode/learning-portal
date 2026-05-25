import re
from datetime import date, datetime, time
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.owner_dashboard import StudentLearningAIInsightResponse
from app.schemas.owner_workspace import (
    OwnerWorkspaceWebPushStatusResponse,
    OwnerWorkspaceWebPushSubscriptionDelete,
    OwnerWorkspaceWebPushSubscriptionUpsert,
)


class ParentDashboardNearestLessonResponse(BaseModel):
    group_id: int
    group_name: str
    lesson_date: date
    start_time: time
    end_time: time
    trainer_id: Optional[int] = None
    trainer_name: Optional[str] = None


class ParentDashboardStudentSummaryResponse(BaseModel):
    student_id: int
    student_name: str
    current_balance: float = 0.0
    next_payment_date: Optional[date] = None
    payment_link: Optional[str] = None
    nearest_lesson: Optional[ParentDashboardNearestLessonResponse] = None
    ai_insight: Optional[StudentLearningAIInsightResponse] = None


class ParentDashboardSummaryResponse(BaseModel):
    students: List[ParentDashboardStudentSummaryResponse]


class ParentQuestionCreate(BaseModel):
    student_id: int
    topic: Optional[str] = Field(None, max_length=255)
    message: str = Field(..., min_length=3, max_length=4000)


class ParentQuestionResponse(BaseModel):
    id: int
    parent_user_id: int
    student_id: int
    target_trainer_id: Optional[int] = None
    topic: Optional[str] = None
    message: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ParentWeeklyDigestSettingsResponse(BaseModel):
    enabled: bool = True
    weekday: int = 4
    send_time: str = "09:00"


class ParentWeeklyDigestSettingsUpdate(BaseModel):
    enabled: bool = True
    weekday: int = Field(4, ge=0, le=6)
    send_time: str = Field("09:00", min_length=4, max_length=5)

    @field_validator("send_time")
    @classmethod
    def validate_send_time(cls, value: str) -> str:
        text = (value or "").strip()
        if not re.fullmatch(r"\d{2}:\d{2}", text):
            raise ValueError("send_time must be HH:MM")
        hour = int(text[:2])
        minute = int(text[3:5])
        if hour > 23 or minute > 59:
            raise ValueError("send_time must be HH:MM")
        return text


__all__ = [name for name in globals() if not name.startswith("_")]
