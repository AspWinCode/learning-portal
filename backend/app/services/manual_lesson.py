"""
Use case: создание ручного урока (custom lesson), в т.ч. для отработки по пропуску.

Домен: Operations.
Источник: BACKEND_REFACTOR_USE_CASES.md (create_manual_lesson_for_absence).
При указании planned_absence_id и типе makeup обновляет AbsenceFollowUp (stage=assigned, makeup_custom_lesson_id).
"""

from dataclasses import dataclass
from datetime import date, time
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import (
    AbsenceFollowUp,
    CustomLesson,
    CustomLessonStudent,
    CustomLessonType,
    Student,
    User,
)


@dataclass
class CreateManualLessonResult:
    """Результат создания ручного урока."""
    lesson: CustomLesson


def create_manual_lesson(
    db: Session,
    title: str,
    lesson_date: date,
    start_time: time,
    end_time: Optional[time],
    trainer_id: int,
    lesson_type: str,
    comment: Optional[str],
    students: List[Tuple[int, Optional[int]]],
    created_by_id: int,
) -> CreateManualLessonResult:
    """
    Создаёт ручной урок (отработка / доп. урок / пробное) и при необходимости
    привязывает пропуски (AbsenceFollowUp) к уроку для типа makeup.

    students: список пар (student_id, planned_absence_id или None).

    Raises:
        ValueError: тренер не найден; ученик не найден; пропуск не найден для ученика.
    """
    trainer = db.query(User).filter(User.id == trainer_id).first()
    if not trainer:
        raise ValueError("Тренер не найден")

    lesson_type_enum = CustomLessonType(lesson_type)
    lesson = CustomLesson(
        title=title.strip(),
        lesson_date=lesson_date,
        start_time=start_time,
        end_time=end_time,
        trainer_id=trainer_id,
        lesson_type=lesson_type_enum,
        comment=(comment or "").strip() or None,
        created_by_id=created_by_id,
    )
    db.add(lesson)
    db.flush()

    for student_id, planned_absence_id in students:
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student:
            raise ValueError(f"Ученик {student_id} не найден")
        if planned_absence_id is not None:
            absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == planned_absence_id).first()
            if not absence or absence.student_id != student_id:
                raise ValueError(f"Пропуск {planned_absence_id} не найден для этого ученика")

        cls = CustomLessonStudent(
            lesson_id=lesson.id,
            student_id=student_id,
            planned_absence_id=planned_absence_id,
            attended=False,
        )
        db.add(cls)

        if lesson_type == "makeup" and planned_absence_id is not None:
            absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == planned_absence_id).first()
            if absence and absence.student_id == student_id:
                absence.stage = "assigned"
                absence.makeup_custom_lesson_id = lesson.id
                absence.makeup_group_id = None
                absence.makeup_lesson_date = None

    db.commit()
    db.refresh(lesson)
    return CreateManualLessonResult(lesson=lesson)
