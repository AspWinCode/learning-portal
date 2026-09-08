"""Сводка для домашней страницы администратора (учебные операции)."""
from datetime import datetime, timedelta
from typing import Dict

from sqlalchemy.orm import Session

from app.models import (
    Abonement,
    AbonementStatus,
    AbsenceFollowUp,
    Characteristic,
    CharacteristicStatus,
    Grade,
    Group,
    GroupStatus,
    OwnerWorkspaceTask,
    Program,
    ProgramStatus,
    Student,
    StudentStatus,
    User,
    UserRole,
)
from app.utils.datetime import utcnow


def build_admin_dashboard_summary(db: Session) -> Dict[str, object]:
    now = utcnow()
    d7 = now - timedelta(days=7)

    def _count(query) -> int:
        return int(query.count())

    return {
        "generated_at": now,
        "active_students": _count(
            db.query(Student).filter(Student.status == StudentStatus.ACTIVE)
        ),
        "active_groups": _count(
            db.query(Group).filter(Group.status == GroupStatus.ACTIVE)
        ),
        "active_trainers": _count(
            db.query(User).filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        ),
        "active_methodists": _count(
            db.query(User).filter(User.role == UserRole.METHODIST, User.is_active.is_(True))
        ),
        "active_programs": _count(
            db.query(Program).filter(Program.status == ProgramStatus.ACTIVE)
        ),
        "active_abonements": _count(
            db.query(Abonement).filter(Abonement.status == AbonementStatus.ACTIVE)
        ),
        "characteristics_pending": _count(
            db.query(Characteristic).filter(
                Characteristic.status == CharacteristicStatus.PENDING
            )
        ),
        "grades_last_7_days": _count(
            db.query(Grade).filter(Grade.created_at >= d7)
        ),
        "makeups_pending": _count(
            db.query(AbsenceFollowUp).filter(
                AbsenceFollowUp.stage.in_(("missed", "link_sent", "assigned"))
            )
        ),
        "open_tasks": _count(
            db.query(OwnerWorkspaceTask).filter(
                OwnerWorkspaceTask.status.in_(("new", "in_progress", "waiting"))
            )
        ),
    }
