from typing import Any, List, Optional

from pydantic import BaseModel, Field

# ─── Enums (mirror ТехноЛаб / pro-reshaut OpenAPI) ────────────────────────────

TaskType = str  # python_io, python_oop, python_numpy, sql_query, cpp_io, js_io
RunnerType = str  # stdin_runner, pytest_runner, sql_runner, cpp_runner, js_runner
TestType = str  # public, hidden
CourseNodeType = str  # module, submodule, topic, subtopic
CourseNodeStatus = str  # draft, published, archived
CourseStatus = str  # draft, published, archived
TaskStatus = str  # draft, published, archived


# ─── Courses ───────────────────────────────────────────────────────────────

class TechnoLabCourseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    description: Optional[str] = None
    short_description: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: CourseStatus = "draft"
    sort_order: int = 0


class TechnoLabCourseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    description: Optional[str] = None
    short_description: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: Optional[CourseStatus] = None
    sort_order: Optional[int] = None


# ─── Course nodes (tree: module/submodule/topic/subtopic) ────────────────────

class TechnoLabNodeCreate(BaseModel):
    parent_id: Optional[int] = None
    type: CourseNodeType
    title: str
    description: Optional[str] = None
    sort_order: int = 0
    status: CourseNodeStatus = "draft"


class TechnoLabNodeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[CourseNodeStatus] = None


class TechnoLabNodeMove(BaseModel):
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class TechnoLabNodeContentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str
    sort_order: int = 0


# ─── Node ↔ task attachment ────────────────────────────────────────────────

class TechnoLabNodeTaskCreate(BaseModel):
    task_id: Optional[int] = None
    create_new_task: bool = False
    task_title: Optional[str] = None
    sort_order: Optional[int] = None
    is_required: bool = True


# ─── Tasks ─────────────────────────────────────────────────────────────────

class TechnoLabTaskTestCreate(BaseModel):
    test_type: TestType = "public"
    input_data: Optional[str] = None
    expected_output: Optional[str] = None
    verification_sql: Optional[str] = None
    test_files: Optional[List[Any]] = None
    weight: float = 1.0
    order_index: int = 0


class TechnoLabTaskLectureCreate(BaseModel):
    content: str
    unlock_attempts: int = 0


class TechnoLabTaskHintCreate(BaseModel):
    hint_level: int = 1
    unlock_attempts: int = 3
    coin_cost: int = 30
    content: str


class TechnoLabTaskCreate(BaseModel):
    submodule_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    task_type: TaskType
    runner_type: RunnerType
    status: TaskStatus = "draft"
    reward_coins: int = 10
    sql_schema: Optional[str] = None
    sql_seed: Optional[str] = None
    tests: List[TechnoLabTaskTestCreate] = []
    hints: List[TechnoLabTaskHintCreate] = []
    lectures: List[TechnoLabTaskLectureCreate] = []


class TechnoLabTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    submodule_id: Optional[int] = None
    task_type: Optional[TaskType] = None
    runner_type: Optional[RunnerType] = None
    status: Optional[TaskStatus] = None
    reward_coins: Optional[int] = None
    sql_schema: Optional[str] = None
    sql_seed: Optional[str] = None
