from typing import List, Optional

from pydantic import BaseModel

# ─── Прогресс ученика на Codelab (методист/тренер/родитель) ────────────────────


class CodelabCourseProgress(BaseModel):
    course_id: int
    course_title: str
    tasks_solved: int = 0
    tasks_total: int = 0
    points: int = 0


class CodelabSubmission(BaseModel):
    id: int
    task_title: str
    # Статусы Judge согласно ТЗ (JDG-004): Accepted, Wrong Answer,
    # Time Limit Exceeded, Memory Limit Exceeded, Runtime Error,
    # Compilation Error, Presentation Error, Security Violation, Internal Error.
    verdict: Optional[str] = None
    status: str
    created_at: str


class CodelabStudentProgress(BaseModel):
    started: bool = True
    points_total: int = 0
    rank_name: Optional[str] = None
    courses: List[CodelabCourseProgress] = []
    recent_submissions: List[CodelabSubmission] = []


# ─── Вебхук публикации курса — ведёт пункт витрины `codelab-<course_id>` ───────


class CodelabWebhookCourse(BaseModel):
    id: int
    slug: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: Optional[str] = None


class CodelabCourseWebhook(BaseModel):
    event: str  # published | unpublished | deleted
    course: CodelabWebhookCourse


# ─── Студия методиста / кабинет преподавателя — проксирование admin-API Codelab ─
# Портал ничего не хранит, только прокидывает в /api/lms-admin/** Codelab
# (codelab_client.py). Поля намеренно нетипизированы построчно (dict) там, где
# Codelab и так уже валидирует форму запроса — дублировать его pydantic-схемы
# один в один здесь не даёт дополнительной защиты, только рассинхронизацию.


class CodelabCourseCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    description: Optional[str] = None


class CodelabGradeIn(BaseModel):
    score: float
    comment: str
