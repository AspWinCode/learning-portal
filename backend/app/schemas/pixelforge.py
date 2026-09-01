from typing import List, Optional

from pydantic import BaseModel

# ─── Прогресс ученика на PixelForge (методист/тренер/родитель) ─────────────────


class PixelForgeCourseProgress(BaseModel):
    course_id: int
    course_title: str
    progress_percent: float = 0.0
    completed_lessons: int = 0
    total_lessons: int = 0


class PixelForgeSubmission(BaseModel):
    id: int
    project_title: str
    verdict: Optional[str] = None
    status: str
    created_at: str


class PixelForgeStudentProgress(BaseModel):
    started: bool = True
    xp_total: int = 0
    level_name: Optional[str] = None
    courses: List[PixelForgeCourseProgress] = []
    recent_submissions: List[PixelForgeSubmission] = []
