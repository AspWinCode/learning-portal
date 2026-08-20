"""Студия методиста: управление учебными курсами и уроками."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseContent, CourseLesson, User

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LessonIn(BaseModel):
    title: str
    theory_md: Optional[str] = None
    homework_md: Optional[str] = None
    is_published: bool = False


class LessonOut(BaseModel):
    id: int
    course_id: int
    title: str
    theory_md: Optional[str]
    homework_md: Optional[str]
    sort_order: int
    is_published: bool

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

    class Config:
        from_attributes = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_course_or_404(course_id: int, db: Session) -> CourseContent:
    course = db.query(CourseContent).filter(CourseContent.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    return course


def _get_lesson_or_404(course_id: int, lesson_id: int, db: Session) -> CourseLesson:
    lesson = (
        db.query(CourseLesson)
        .filter(CourseLesson.id == lesson_id, CourseLesson.course_id == course_id)
        .first()
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    return lesson


# ─── Courses ─────────────────────────────────────────────────────────────────

@router.get("/courses", response_model=List[CourseSummaryOut])
def list_courses(
    current_user: User = Depends(auth.require_permission("kodex.access")),
    db: Session = Depends(get_db),
):
    courses = db.query(CourseContent).order_by(CourseContent.sort_order, CourseContent.id).all()
    return [
        CourseSummaryOut(
            id=c.id,
            title=c.title,
            description=c.description,
            is_published=c.is_published,
            sort_order=c.sort_order,
            lesson_count=len(c.lessons),
        )
        for c in courses
    ]


@router.post("/courses", response_model=CourseFullOut, status_code=status.HTTP_201_CREATED)
def create_course(
    body: CourseIn,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    max_order = db.query(CourseContent).count()
    course = CourseContent(
        title=body.title,
        description=body.description,
        is_published=body.is_published,
        sort_order=max_order,
        author_id=current_user.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/courses/{course_id}", response_model=CourseFullOut)
def get_course(
    course_id: int,
    current_user: User = Depends(auth.require_permission("kodex.access")),
    db: Session = Depends(get_db),
):
    return _get_course_or_404(course_id, db)


@router.put("/courses/{course_id}", response_model=CourseFullOut)
def update_course(
    course_id: int,
    body: CourseIn,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(course_id, db)
    course.title = body.title
    course.description = body.description
    course.is_published = body.is_published
    db.commit()
    db.refresh(course)
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(course_id, db)
    db.delete(course)
    db.commit()


# ─── Lessons ─────────────────────────────────────────────────────────────────

@router.post("/courses/{course_id}/lessons", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
def create_lesson(
    course_id: int,
    body: LessonIn,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    _get_course_or_404(course_id, db)
    count = db.query(CourseLesson).filter(CourseLesson.course_id == course_id).count()
    lesson = CourseLesson(
        course_id=course_id,
        title=body.title,
        theory_md=body.theory_md,
        homework_md=body.homework_md,
        is_published=body.is_published,
        sort_order=count,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.put("/courses/{course_id}/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(
    course_id: int,
    lesson_id: int,
    body: LessonIn,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(course_id, lesson_id, db)
    lesson.title = body.title
    lesson.theory_md = body.theory_md
    lesson.homework_md = body.homework_md
    lesson.is_published = body.is_published
    db.commit()
    db.refresh(lesson)
    return lesson


@router.delete("/courses/{course_id}/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(course_id, lesson_id, db)
    siblings = (
        db.query(CourseLesson)
        .filter(CourseLesson.course_id == course_id)
        .order_by(CourseLesson.sort_order)
        .all()
    )
    db.delete(lesson)
    db.flush()
    for i, s in enumerate(l for l in siblings if l.id != lesson_id):
        s.sort_order = i
    db.commit()


@router.post("/courses/{course_id}/lessons/{lesson_id}/move", response_model=List[LessonOut])
def move_lesson(
    course_id: int,
    lesson_id: int,
    direction: str,  # "up" | "down"
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    lessons = (
        db.query(CourseLesson)
        .filter(CourseLesson.course_id == course_id)
        .order_by(CourseLesson.sort_order)
        .all()
    )
    idx = next((i for i, l in enumerate(lessons) if l.id == lesson_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Урок не найден")

    swap = idx - 1 if direction == "up" else idx + 1
    if swap < 0 or swap >= len(lessons):
        return lessons

    lessons[idx].sort_order, lessons[swap].sort_order = lessons[swap].sort_order, lessons[idx].sort_order
    db.commit()
    for l in lessons:
        db.refresh(l)
    return sorted(lessons, key=lambda l: l.sort_order)
