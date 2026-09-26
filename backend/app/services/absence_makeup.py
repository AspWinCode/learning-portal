"""
Use case: назначение отработки по пропуску (assign_makeup_for_absence).

Домен: Operations / Education.
Источник: BACKEND_REFACTOR_USE_CASES.md.
При назначении отработки создаётся задача «Отправить ссылку» (absence_link_tasks).
"""

from dataclasses import dataclass
from datetime import date
import logging

from sqlalchemy.orm import Session

from app.models import AbsenceFollowUp, Group, GroupSchedule, LessonAttendance

logger = logging.getLogger(__name__)


def _place_student_on_makeup_lesson(
    db: Session,
    *,
    student_id: int,
    group_id: int,
    lesson_date: date,
    trainer_id: int | None,
) -> None:
    """Добавить ученика на конкретный урок группы отработки — так же, как
    ручное добавление на урок (add-student-to-lesson): создаётся запись
    LessonAttendance, и ученик появляется в обычном списке урока у тренера
    на эту дату, а не отдельным "виртуальным" уроком. Тренер отмечает его
    как обычного ученика; при отметке "присутствовал" пропуск закрывается
    (см. _close_absence_for_group_makeup в trainer_lessons.py)."""
    existing = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.group_id == group_id,
            LessonAttendance.lesson_date == lesson_date,
            LessonAttendance.student_id == student_id,
        )
        .first()
    )
    if existing:
        return

    schedule = (
        db.query(GroupSchedule)
        .filter(
            GroupSchedule.group_id == group_id,
            GroupSchedule.day_of_week == lesson_date.weekday(),
        )
        .order_by(GroupSchedule.start_time)
        .first()
    )
    db.add(
        LessonAttendance(
            group_id=group_id,
            lesson_date=lesson_date,
            student_id=student_id,
            attended=True,
            late=False,
            lesson_start_time=schedule.start_time if schedule else None,
            lesson_end_time=schedule.end_time if schedule else None,
            trainer_id=trainer_id,
        )
    )


def remove_stale_makeup_placement(
    db: Session,
    *,
    student_id: int,
    group_id: int | None,
    lesson_date: date | None,
) -> None:
    """Убрать плейсхолдер отработки с прошлого/отменённого назначения (перевыбрали
    слот, либо пропуск закрыли как "пропустил отработку"/"не нужна"), если тренер
    ещё не отметил по нему реальную посещаемость."""
    if not group_id or not lesson_date:
        return
    db.query(LessonAttendance).filter(
        LessonAttendance.group_id == group_id,
        LessonAttendance.lesson_date == lesson_date,
        LessonAttendance.student_id == student_id,
    ).delete()


def credit_makeup_for_absence(db: Session, absence: AbsenceFollowUp) -> None:
    """Засчитать пропуск как отработанный: исходный урок (lesson_attendance_id)
    помечается посещённым, чтобы пропуск перестал считаться пропуском и
    учитывался как +1 к «Отходил» — без появления лишнего «нового» занятия
    в «Количество посещений» (там, где отработка проходит отдельным
    физическим уроком, эта отдельная запись исключается из статистики
    отдельно, см. excluded_from_attendance_stats)."""
    original = (
        db.query(LessonAttendance)
        .filter(LessonAttendance.id == absence.lesson_attendance_id)
        .first()
    )
    if original and not original.attended:
        original.attended = True


def uncredit_makeup_for_absence(db: Session, absence: AbsenceFollowUp) -> None:
    """Откатить зачёт отработки (пропуск вернули в работу): исходный урок
    снова считается пропущенным."""
    original = (
        db.query(LessonAttendance)
        .filter(LessonAttendance.id == absence.lesson_attendance_id)
        .first()
    )
    if original and original.attended:
        original.attended = False


@dataclass
class AssignMakeupResult:
    """Результат назначения отработки."""
    absence: AbsenceFollowUp


def assign_makeup_for_absence(
    db: Session,
    absence_id: int,
    makeup_group_id: int,
    makeup_lesson_date: date,
) -> AssignMakeupResult:
    """
    Назначает отработку на группу и дату занятия. Обновляет stage в "assigned"
    и создаёт задачу «Отправить ссылку» через absence_link_tasks.

    Raises:
        ValueError: пропуск не найден, группа не найдена.
    """
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == absence_id).first()
    if not absence:
        raise ValueError("Пропуск не найден")
    group = db.query(Group).filter(Group.id == makeup_group_id).first()
    if not group:
        raise ValueError("Группа не найдена")

    prev_group_id = absence.makeup_group_id
    prev_lesson_date = absence.makeup_lesson_date
    if prev_group_id != makeup_group_id or prev_lesson_date != makeup_lesson_date:
        remove_stale_makeup_placement(
            db, student_id=absence.student_id, group_id=prev_group_id, lesson_date=prev_lesson_date
        )

    absence.makeup_group_id = makeup_group_id
    absence.makeup_lesson_date = makeup_lesson_date
    absence.stage = "assigned"

    _place_student_on_makeup_lesson(
        db,
        student_id=absence.student_id,
        group_id=makeup_group_id,
        lesson_date=makeup_lesson_date,
        trainer_id=group.trainer_id,
    )

    try:
        from app.services.absence_link_tasks import create_link_task_on_assign
        create_link_task_on_assign(db, absence)
    except Exception:
        # Логируем, но не блокируем основной поток (как в роутере)
        logger.exception("Failed to create absence link task on makeup assignment")

    db.commit()
    db.refresh(absence)
    return AssignMakeupResult(absence=absence)
