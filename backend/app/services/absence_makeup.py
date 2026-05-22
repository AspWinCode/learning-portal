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

from app.models import AbsenceFollowUp, Group

logger = logging.getLogger(__name__)


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
