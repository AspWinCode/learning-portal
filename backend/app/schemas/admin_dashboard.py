from datetime import datetime

from pydantic import BaseModel


class AdminDashboardSummaryResponse(BaseModel):
    generated_at: datetime
    active_students: int
    active_groups: int
    active_trainers: int
    active_methodists: int
    active_programs: int
    active_abonements: int
    characteristics_pending: int
    grades_last_7_days: int
    makeups_pending: int
    open_tasks: int
