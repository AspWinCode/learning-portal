from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.programs import ProgramSummaryResponse
from app.schemas.students import StudentResponse
from app.schemas.users import UserResponse


class GroupBase(BaseModel):
    name: str
    direction: Optional[str] = None


class GroupScheduleCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time


class GroupScheduleResponse(BaseModel):
    id: int
    group_id: int
    day_of_week: int
    start_time: time
    end_time: time

    model_config = ConfigDict(from_attributes=True)


class GroupCreate(GroupBase):
    trainer_id: int
    student_ids: Optional[List[int]] = []
    schedules: Optional[List[GroupScheduleCreate]] = []
    start_date: Optional[date] = None
    lesson_format: Optional[str] = "group"
    units_per_session: Optional[int] = 1
    extra_rate_per_unit: Optional[float] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    direction: Optional[str] = None
    trainer_id: Optional[int] = None
    status: Optional[str] = None
    schedules: Optional[List[GroupScheduleCreate]] = None
    start_date: Optional[date] = None
    lesson_format: Optional[str] = None
    units_per_session: Optional[int] = None
    extra_rate_per_unit: Optional[float] = None


class GroupResponse(GroupBase):
    id: int
    trainer_id: int
    status: str
    created_at: datetime
    start_date: Optional[date] = None
    lesson_format: Optional[str] = "group"
    units_per_session: Optional[int] = 1
    extra_rate_per_unit: Optional[float] = None
    trainer: Optional[UserResponse] = None
    students: Optional[List[StudentResponse]] = []
    programs: Optional[List[ProgramSummaryResponse]] = []
    schedules: Optional[List[GroupScheduleResponse]] = []

    model_config = ConfigDict(from_attributes=True)


class GroupListResponse(BaseModel):
    total: int
    items: List[GroupResponse]
    skip: int
    limit: int


class LessonAttendanceItem(BaseModel):
    student_id: int
    attended: bool
    late: Optional[bool] = False
    absence_reason: Optional[str] = None
    absence_comment: Optional[str] = None


class LessonAttendanceSave(BaseModel):
    group_id: int
    lesson_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    attendances: List[LessonAttendanceItem]


class MoveLessonPayload(BaseModel):
    group_id: int
    from_date: date
    to_date: date
    from_start_time: Optional[str] = None
    from_end_time: Optional[str] = None
    to_start_time: Optional[str] = None
    to_end_time: Optional[str] = None


class CancelLessonPayload(BaseModel):
    group_id: int
    lesson_date: date
    start_time: str
    end_time: str


class LessonSlotExtraPolicyPayload(BaseModel):
    lesson_date: date
    start_time: str
    end_time: str
    extra_policy: str = "free"
    extra_rate_per_unit: Optional[float] = None


class LessonSlotExtraPolicyResponse(BaseModel):
    lesson_date: date
    start_time: str
    end_time: str
    extra_policy: str
    extra_rate_per_unit: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class CreateLessonSlotPayload(BaseModel):
    group_id: int
    lesson_date: date
    start_time: str
    end_time: str


class AddStudentToLessonPayload(BaseModel):
    group_id: int
    lesson_date: date
    student_id: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class RemoveStudentFromLessonPayload(BaseModel):
    group_id: int
    lesson_date: date
    student_id: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class LessonCallResultUpdate(BaseModel):
    group_id: int
    lesson_date: date
    student_id: int
    call_result: str


class TrainerLessonSlotResponse(BaseModel):
    group_id: int
    group_name: str
    program_name: Optional[str] = None
    day_of_week: int
    start_time: time
    end_time: time
    lesson_date: date
    students: List[Dict[str, Any]]
    trainer_id: Optional[int] = None
    trainer_name: Optional[str] = None
    lesson_index_in_month: Optional[int] = None
    is_cancelled: bool = False
    moved_to_date: Optional[date] = None
    moved_to_start_time: Optional[time] = None
    moved_to_end_time: Optional[time] = None

    model_config = ConfigDict(from_attributes=True)


class SetLessonTrainerPayload(BaseModel):
    group_id: int
    lesson_date: date
    start_time: str
    end_time: str
    trainer_id: int


__all__ = [name for name in globals() if not name.startswith("_")]
