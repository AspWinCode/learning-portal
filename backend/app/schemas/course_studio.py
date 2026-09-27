"""Схемы Студии методиста: курсы, уроки и импортируемая программа обучения."""
from typing import List, Optional

from pydantic import BaseModel


class LessonIn(BaseModel):
    title: str
    theory_md: Optional[str] = None
    homework_md: Optional[str] = None
    is_published: bool = False


class LessonOut(BaseModel):
    id: int
    course_id: int
    topic_id: Optional[int] = None
    title: str
    theory_md: Optional[str]
    homework_md: Optional[str]
    sort_order: int
    is_published: bool

    class Config:
        from_attributes = True


class TopicOut(BaseModel):
    id: int
    title: str
    sort_order: int
    lessons: List[LessonOut] = []

    class Config:
        from_attributes = True


class SubmoduleOut(BaseModel):
    id: int
    title: str
    sort_order: int
    topics: List[TopicOut] = []

    class Config:
        from_attributes = True


class ModuleOut(BaseModel):
    id: int
    title: str
    sort_order: int
    submodules: List[SubmoduleOut] = []
    topics: List[TopicOut] = []

    class Config:
        from_attributes = True


class CourseIn(BaseModel):
    title: str
    description: Optional[str] = None
    is_published: bool = False


class CourseSummaryOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    is_published: bool
    sort_order: int
    lesson_count: int

    class Config:
        from_attributes = True


class CourseFullOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    is_published: bool
    sort_order: int
    lessons: List[LessonOut]
    modules: List[ModuleOut] = []

    class Config:
        from_attributes = True


class PreviewLesson(BaseModel):
    title: str
    theory_md: str
    homework_md: str


class PreviewTopic(BaseModel):
    title: str
    lessons: List[PreviewLesson]


class PreviewSubmodule(BaseModel):
    title: str
    topics: List[PreviewTopic]


class PreviewModule(BaseModel):
    title: str
    submodules: List[PreviewSubmodule]
    topics: List[PreviewTopic]


class ImportPreviewOut(BaseModel):
    modules: List[PreviewModule]
    warnings: List[str]
    module_count: int
    topic_count: int
    lesson_count: int
