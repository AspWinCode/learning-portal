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


# ─── Студия методиста: тела запросов ──────────────────────────────────────────
# PixelForge authoring API — camelCase (Spring). Схемы повторяют его контракт
# 1-в-1: фронт шлёт camelCase, роутер прокидывает model_dump(exclude_unset=True)
# в pixelforge_client без трансляции. См. docs/integrations/pixelforge-studio-spec.md

class PixelForgeCourseCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None            # DRAFT | PUBLISHED | ARCHIVED
    sortOrder: Optional[int] = None


class PixelForgeCourseUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    sortOrder: Optional[int] = None


class PixelForgeNodeCreate(BaseModel):
    type: str                               # MODULE | TOPIC | SUBTOPIC
    title: str
    parentId: Optional[int] = None
    description: Optional[str] = None
    sortOrder: Optional[int] = None
    status: Optional[str] = None


class PixelForgeNodeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    sortOrder: Optional[int] = None
    status: Optional[str] = None
    type: Optional[str] = None


class PixelForgeNodeMove(BaseModel):
    parentId: Optional[int] = None
    sortOrder: Optional[int] = None


class PixelForgeNodeReorder(BaseModel):
    orderedIds: List[int]
    parentId: Optional[int] = None


class PixelForgeNodeTaskCreate(BaseModel):
    createNew: bool = False
    assignmentId: Optional[int] = None
    title: Optional[str] = None
    tool: Optional[str] = None              # SNAP | GDEVELOP (нужен при createNew)
    description: Optional[str] = None
    deadline: Optional[str] = None
    lectureId: Optional[int] = None
    isRequired: Optional[bool] = None


class PixelForgeTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tool: Optional[str] = None
    deadline: Optional[str] = None
    lectureId: Optional[int] = None
    classId: Optional[int] = None           # мост «показать задачу ученику» до enrollment


class PixelForgeReorder(BaseModel):
    orderedIds: List[int]


class PixelForgeTaskTest(BaseModel):
    testType: Optional[str] = None          # PUBLIC | HIDDEN
    inputData: Optional[str] = None
    expectedOutput: Optional[str] = None
    checker: Optional[str] = None           # EXACT | TRIMMED | REGEX | MANUAL (не исполняется)
    weight: Optional[float] = None
    orderIndex: Optional[int] = None


class PixelForgeTaskHint(BaseModel):
    content: str
    level: Optional[int] = None
    unlockAttempts: Optional[int] = None
    coinCost: Optional[int] = None
    orderIndex: Optional[int] = None


class PixelForgeLecture(BaseModel):
    title: str


class PixelForgeCardCreate(BaseModel):
    cardType: str                           # TEXT | IMAGE | VIDEO | SNAP_SNIPPET
    content: Optional[str] = None


class PixelForgeCardUpdate(BaseModel):
    cardType: Optional[str] = None
    content: Optional[str] = None


# ─── Вебхук публикации курса (§8.2) ──────────────────────────────────────────

class PixelForgeWebhookCourse(BaseModel):
    id: int
    slug: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: Optional[str] = None


class PixelForgeCourseWebhook(BaseModel):
    event: str                              # published | unpublished | deleted
    course: PixelForgeWebhookCourse
