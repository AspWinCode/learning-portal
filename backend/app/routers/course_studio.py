"""Студия методиста: управление учебными курсами, уроками и импорт программы обучения."""
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseContent, CourseLesson, CourseModule, CourseSubmodule, CourseTopic, User
from app.routers.action_log import log_action
from app.schemas.course_studio import (
    CourseFullOut,
    CourseIn,
    CourseSummaryOut,
    ImportPreviewOut,
    LessonIn,
    LessonOut,
    PreviewLesson,
    PreviewModule,
    PreviewSubmodule,
    PreviewTopic,
)
from app.services.course_program_docx import DocxProgramParseError, ParsedProgram, parse_program_docx

router = APIRouter()

MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 МБ
DOCX_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


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


async def _read_docx_upload(file: UploadFile) -> bytes:
    filename = (file.filename or "").lower()
    if not filename.endswith(".docx") and file.content_type not in DOCX_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Ожидается файл в формате .docx")
    data = await file.read(MAX_IMPORT_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail=f"Файл слишком большой (макс. {MAX_IMPORT_BYTES // (1024 * 1024)} МБ)")
    return data


def _parse_or_400(data: bytes) -> ParsedProgram:
    try:
        return parse_program_docx(data)
    except DocxProgramParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _preview_topic(t) -> PreviewTopic:
    return PreviewTopic(
        title=t.title,
        lessons=[PreviewLesson(title=l.title, theory_md=l.theory_md, homework_md=l.homework_md) for l in t.lessons],
    )


def _to_preview_out(program: ParsedProgram) -> ImportPreviewOut:
    modules = []
    module_count = topic_count = lesson_count = 0
    for m in program.modules:
        module_count += 1
        topics = [_preview_topic(t) for t in m.topics]
        submodules = []
        for s in m.submodules:
            s_topics = [_preview_topic(t) for t in s.topics]
            submodules.append(PreviewSubmodule(title=s.title, topics=s_topics))
        modules.append(PreviewModule(title=m.title, submodules=submodules, topics=topics))
        all_topics = m.topics + [t for s in m.submodules for t in s.topics]
        topic_count += len(all_topics)
        lesson_count += sum(len(t.lessons) for t in all_topics)
    return ImportPreviewOut(
        modules=modules,
        warnings=program.warnings,
        module_count=module_count,
        topic_count=topic_count,
        lesson_count=lesson_count,
    )


def _persist_program(course: CourseContent, program: ParsedProgram, db: Session) -> None:
    module_order = db.query(CourseModule).filter(CourseModule.course_id == course.id).count()
    for m in program.modules:
        module = CourseModule(course_id=course.id, title=m.title, sort_order=module_order)
        module_order += 1
        db.add(module)
        db.flush()

        def persist_topic(topic, submodule_id=None, order=0):
            db_topic = CourseTopic(module_id=module.id, submodule_id=submodule_id, title=topic.title, sort_order=order)
            db.add(db_topic)
            db.flush()
            for i, lesson in enumerate(topic.lessons):
                db.add(
                    CourseLesson(
                        course_id=course.id,
                        topic_id=db_topic.id,
                        title=lesson.title,
                        theory_md=lesson.theory_md or None,
                        homework_md=lesson.homework_md or None,
                        sort_order=i,
                        is_published=False,
                    )
                )

        for i, topic in enumerate(m.topics):
            persist_topic(topic, submodule_id=None, order=i)

        for si, submodule in enumerate(m.submodules):
            db_submodule = CourseSubmodule(module_id=module.id, title=submodule.title, sort_order=si)
            db.add(db_submodule)
            db.flush()
            for ti, topic in enumerate(submodule.topics):
                persist_topic(topic, submodule_id=db_submodule.id, order=ti)


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
    log_action(db, current_user.id, "create", "course_content", course.id, {"title": course.title, "is_published": course.is_published})
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
    log_action(db, current_user.id, "update", "course_content", course.id, body.model_dump())
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(course_id, db)
    course_title = course.title
    db.delete(course)
    db.commit()
    log_action(db, current_user.id, "delete", "course_content", course_id, {"title": course_title})


# ─── Modules (программа обучения) ──────────────────────────────────────────────

@router.delete("/courses/{course_id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    course_id: int,
    module_id: int,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    _get_course_or_404(course_id, db)
    module = (
        db.query(CourseModule)
        .filter(CourseModule.id == module_id, CourseModule.course_id == course_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=404, detail="Модуль не найден")
    module_title = module.title
    db.delete(module)
    db.commit()
    log_action(db, current_user.id, "delete", "course_module", module_id, {"course_id": course_id, "title": module_title})


# ─── Импорт программы обучения из .docx ───────────────────────────────────────

@router.post("/courses/{course_id}/import/preview", response_model=ImportPreviewOut)
async def preview_import(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    _get_course_or_404(course_id, db)
    data = await _read_docx_upload(file)
    program = _parse_or_400(data)
    return _to_preview_out(program)


@router.post("/courses/{course_id}/import/commit", response_model=CourseFullOut)
async def commit_import(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(course_id, db)
    data = await _read_docx_upload(file)
    program = _parse_or_400(data)

    _persist_program(course, program, db)
    db.commit()
    db.refresh(course)

    topic_count = sum(
        len(m.topics) + sum(len(s.topics) for s in m.submodules) for m in program.modules
    )
    lesson_count = sum(
        sum(len(t.lessons) for t in m.topics) + sum(len(t.lessons) for s in m.submodules for t in s.topics)
        for m in program.modules
    )
    log_action(
        db,
        current_user.id,
        "import",
        "course_content",
        course_id,
        {"modules": len(program.modules), "topics": topic_count, "lessons": lesson_count},
    )
    return course


# ─── Lessons ─────────────────────────────────────────────────────────────────

@router.post("/courses/{course_id}/lessons", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
def create_lesson(
    course_id: int,
    body: LessonIn,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    _get_course_or_404(course_id, db)
    count = (
        db.query(CourseLesson)
        .filter(CourseLesson.course_id == course_id, CourseLesson.topic_id.is_(None))
        .count()
    )
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
    log_action(db, current_user.id, "create", "course_lesson", lesson.id, {"course_id": course_id, "title": lesson.title})
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
    log_action(db, current_user.id, "update", "course_lesson", lesson.id, body.model_dump())
    return lesson


@router.delete("/courses/{course_id}/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(course_id, lesson_id, db)
    lesson_title = lesson.title
    siblings = (
        db.query(CourseLesson)
        .filter(CourseLesson.course_id == course_id, CourseLesson.topic_id == lesson.topic_id)
        .order_by(CourseLesson.sort_order)
        .all()
    )
    db.delete(lesson)
    db.flush()
    for i, s in enumerate(l for l in siblings if l.id != lesson_id):
        s.sort_order = i
    db.commit()
    log_action(db, current_user.id, "delete", "course_lesson", lesson_id, {"course_id": course_id, "title": lesson_title})


@router.post("/courses/{course_id}/lessons/{lesson_id}/move", response_model=List[LessonOut])
def move_lesson(
    course_id: int,
    lesson_id: int,
    direction: str,  # "up" | "down"
    current_user: User = Depends(auth.require_permission("kodex.manage")),
    db: Session = Depends(get_db),
):
    target = _get_lesson_or_404(course_id, lesson_id, db)
    lessons = (
        db.query(CourseLesson)
        .filter(CourseLesson.course_id == course_id, CourseLesson.topic_id == target.topic_id)
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
    log_action(db, current_user.id, "move", "course_lesson", lesson_id, {"course_id": course_id, "direction": direction})
    return sorted(lessons, key=lambda l: l.sort_order)
