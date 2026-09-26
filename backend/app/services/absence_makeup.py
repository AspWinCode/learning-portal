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

from app.models import AbsenceFollowUp, Group, LessonAttendance

logger = logging.getLogger(__name__)


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

    absence.makeup_group_id = makeup_group_id
    absence.makeup_lesson_date = makeup_lesson_date
    absence.stage = "assigned"

    try:
        from app.services.absence_link_tasks import create_link_task_on_assign
        create_link_task_on_assign(db, absence)
    except Exception:
        # Логируем, но не блокируем основной поток (как в роутере)
        logger.exception("Failed to create absence link task on makeup assignment")

    db.commit()
    db.refresh(absence)
    return AssignMakeupResult(absence=absence)
