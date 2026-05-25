from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class ReportRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    student_ids: Optional[List[int]] = None
    trainer_ids: Optional[List[int]] = None
    format: str = "xlsx"


__all__ = [name for name in globals() if not name.startswith("_")]
