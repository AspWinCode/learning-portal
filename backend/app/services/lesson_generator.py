"""Сервис генерации экземпляров занятий (LessonInstance) из шаблонов расписания (GroupSchedule).

Логика:
- Для каждой активной группы берём все GroupSchedule.
- Для каждого дня в горизонте (today → today + horizon_days) проверяем совпадение дня недели.
- Если экземпляр на эту (group_id, schedule_id, lesson_date) ещё не существует — создаём.
- При создании копируем в LessonInstanceStudent актуальный состав группы (participation_status=planned).
- Не трогаем уже существующие экземпляры (историчность).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Group,
    GroupSchedule,
    GroupStatus,
    GroupStudent,
    LessonInstance,
    LessonInstanceStudent,
    LessonAuditLog,
    Student,
    StudentStatus,
)

logger = logging.getLogger(__name__)

GENERATION_HORIZON_DAYS = 60  # на сколько дней вперёд генерируем


def generate_lesson_instances(
    db: Session,
    *,
    horizon_days: int = GENERATION_HORIZON_DAYS,
    group_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
) -> dict:
    """Генерирует LessonInstance для активных групп на горизонт horizon_days от сегодня.

    Args:
        db: SQLAlchemy session
        horizon_days: сколько дней вперёд генерировать (default 60)
        group_id: если указан — генерируем только для этой группы
        actor_user_id: id пользователя для аудит-лога (None при запуске по расписанию)

    Returns:
        Словарь {'created': int, 'skipped': int, 'groups_processed': int}
    """
    today = date.today()
    end_date = today + timedelta(days=horizon_days)

    # Загружаем активные группы с их расписаниями и студентами
    groups_query = db.query(Group).filter(Group.status == GroupStatus.ACTIVE)
    if group_id is not None:
        groups_query = groups_query.filter(Group.id == group_id)
    groups = groups_query.all()

    created = 0
    skipped = 0

    for group in groups:
        schedules = group.group_schedules
        if not schedules:
            continue

        # Активные студенты группы на момент генерации
        active_students = _get_active_students(db, group.id)

        for schedule in schedules:
            # Генерируем экземпляры для каждого дня в горизонте
            current = today
            while current <= end_date:
                # Проверяем совпадение дня недели (0=Monday, 6=Sunday)
                if current.weekday() == schedule.day_of_week:
                    # Проверяем, что дата >= start_date группы
                    if group.start_date and current < group.start_date:
                        current += timedelta(days=1)
                        continue

                    existing = _find_existing_instance(db, group.id, schedule.id, current)
                    if existing:
                        skipped += 1
                    else:
                        _create_instance(
                            db,
                            group=group,
                            schedule=schedule,
                            lesson_date=current,
                            active_students=active_students,
                            actor_user_id=actor_user_id,
                        )
                        created += 1

                current += timedelta(days=1)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    logger.info(
        "lesson_generator: created=%d skipped=%d groups=%d horizon=%d days",
        created,
        skipped,
        len(groups),
        horizon_days,
    )

    return {
        "created": created,
        "skipped": skipped,
        "groups_processed": len(groups),
    }


def _find_existing_instance(
    db: Session, group_id: int, schedule_id: int, lesson_date: date
) -> Optional[LessonInstance]:
    return (
        db.query(LessonInstance)
        .filter(
            LessonInstance.group_id == group_id,
            LessonInstance.schedule_id == schedule_id,
            LessonInstance.lesson_date == lesson_date,
        )
        .first()
    )


def _get_active_students(db: Session, group_id: int) -> list[Student]:
    """Возвращает активных студентов группы (не вышедших и не архивных)."""
    rows = (
        db.query(GroupStudent)
        .filter(
            GroupStudent.group_id == group_id,
            GroupStudent.left_at.is_(None),
        )
        .all()
    )
    students = []
    for gs in rows:
        student = gs.student
        if student and student.status == StudentStatus.ACTIVE:
            students.append(student)
    return students


def _create_instance(
    db: Session,
    *,
    group: Group,
    schedule: GroupSchedule,
    lesson_date: date,
    active_students: list[Student],
    actor_user_id: Optional[int],
) -> LessonInstance:
    """Создаёт LessonInstance и копирует в него состав учеников."""

    # Тренер из группы (основной; позже может быть переопределён через API)
    trainer_id = group.trainer_id

    # Программа группы (первая активная)
    program_id = None
    if group.group_programs:
        program_id = group.group_programs[0].program_id

    instance = LessonInstance(
        group_id=group.id,
        schedule_id=schedule.id,
        lesson_date=lesson_date,
        start_time=schedule.start_time,
        end_time=schedule.end_time,
        trainer_id=trainer_id,
        program_id=program_id,
        lesson_type="group",
        status="planned",
        source_type="schedule",
        created_by_id=actor_user_id,
    )
    db.add(instance)
    db.flush()  # получаем instance.id

    # Копируем состав учеников
    for student in active_students:
        lis = LessonInstanceStudent(
            lesson_instance_id=instance.id,
            student_id=student.id,
            participation_status="planned",
            attended=None,
            late=False,
        )
        db.add(lis)

    # Аудит-лог
    log = LessonAuditLog(
        lesson_instance_id=instance.id,
        entity_type="lesson",
        action="create",
        new_value=f"date={lesson_date} group_id={group.id} schedule_id={schedule.id}",
        changed_by_id=actor_user_id,
    )
    db.add(log)

    return instance


def ensure_horizon(db: Session, actor_user_id: Optional[int] = None) -> dict:
    """Точка входа для фоновой задачи: поддерживает горизонт 60 дней."""
    return generate_lesson_instances(db, horizon_days=GENERATION_HORIZON_DAYS, actor_user_id=actor_user_id)
