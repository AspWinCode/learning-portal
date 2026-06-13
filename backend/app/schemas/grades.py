from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.programs import TopicResponse
from app.schemas.students import StudentResponse
from app.schemas.users import UserResponse


class GradeBase(BaseModel):
    grade: float = Field(..., ge=0, le=5)
    comment: Optional[str] = None
    date: datetime

    @field_validator("date", mode="before")
    @classmethod
    def parse_calendar_date(cls, value):
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, time.min)
        if isinstance(value, str):
            text = value.strip()
            if len(text) == 10:
                return datetime.combine(date.fromisoformat(text), time.min)
        return value


class GradeCreate(GradeBase):
    student_id: int
    topic_id: int


class GradeUpdate(BaseModel):
    grade: Optional[float] = Field(None, ge=0, le=5)
    comment: Optional[str] = None
    date: Optional[datetime] = None


class GradeResponse(GradeBase):
    id: int
    student_id: int
    topic_id: int
    trainer_id: int
    created_at: datetime
    student: Optional[StudentResponse] = None
    topic: Optional[TopicResponse] = None
    trainer: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [name for name in globals() if not name.startswith("_")]
