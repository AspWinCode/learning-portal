from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, time as dt_time, timedelta
from typing import List

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app import auth
from app.models import (
    AbsenceFollowUp,
    Group,
    GroupSchedule,
    Student,
    Task,
    TaskStatus,
    TaskStudent,
    User,
    UserRole,
)
from app.schemas.sales import MakeupSuggestionItem
from app.services.communication_hub import CommunicationService
from app.utils.datetime import utcnow

MAKEUP_SELECTION_TOKEN_EXPIRE_DAYS = 14
MAKEUP_SELECTION_AUDIENCE = "makeup-selection"


@dataclass
class MakeupSelectionTokenPayload:
    absence_id: int
    student_id: int


def create_makeup_selection_token(*, absence_id: int, student_id: int) -> str:
    expire = utcnow() + timedelta(days=MAKEUP_SELECTION_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": MAKEUP_SELECTION_AUDIENCE,
        "absence_id": absence_id,
        "student_id": student_id,
        "exp": expire,
    }
    return jwt.encode(payload, auth.SECRET_KEY, algorithm=auth.ALGORITHM)


def decode_makeup_selection_token(token: str) -> MakeupSelectionTokenPayload:
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired makeup selection token") from exc
    if payload.get("sub") != MAKEUP_SELECTION_AUDIENCE:
        raise ValueError("Invalid makeup selection token")
    absence_id = int(payload.get("absence_id") or 0)
    student_id = int(payload.get("student_id") or 0)
    if absence_id <= 0 or student_id <= 0:
        raise ValueError("Invalid makeup selection token payload")
    return MakeupSelectionTokenPayload(absence_id=absence_id, student_id=student_id)


def build_makeup_selection_link(token: str) -> str:
    frontend_url = (os.getenv("PORTAL_BASE_URL") or "https://tirskix.space").rstrip("/")
    return f"{frontend_url}/select-makeup?token={token}"


def resolve_absence_by_token(db: Session, token: str) -> AbsenceFollowUp:
    token_payload = decode_makeup_selection_token(token)
    absence = db.query(AbsenceFollowUp).filter(AbsenceFollowUp.id == token_payload.absence_id).first()
    if not absence or absence.student_id != token_payload.student_id:
        raise ValueError("Makeup request not found")
    return absence


def list_makeup_suggestions_for_absence(
    db: Session,
    absence: AbsenceFollowUp,
    *,
    days_ahead: int = 30,
) -> List[MakeupSuggestionItem]:
    today = date.today()
    end_date = today + timedelta(days=days_ahead)
    # Отработка не привязана к совместимости программ — предлагаем любую
    # активную групповую (не индивидуальную) группу, включая исходную группу
    # ученика (другой день той же группы — валидный вариант отработки).
    # См. также suggest_makeups() в routers/sales_makeups.py — та же логика,
    # раньше использовалась таблица GroupProgram/ProgramMakeupCompatibility,
    # но на проде обе таблицы пустые, из-за чего подбор не находил вариантов.
    groups_active = (
        db.query(Group)
        .filter(Group.status == "active")
        .all()
    )
    groups_active = [
        group for group in groups_active
        if (getattr(group, "lesson_format", None) or "group").strip().lower() != "individual"
    ]
    group_ids = [group.id for group in groups_active]
    slots = []
    for sched in db.query(GroupSchedule).filter(GroupSchedule.group_id.in_(group_ids)).all():
        for delta in range((end_date - today).days + 1):
            lesson_date = today + timedelta(days=delta)
            if lesson_date.weekday() == sched.day_of_week:
                slots.append((sched.group_id, lesson_date, sched.start_time))

    result: List[MakeupSuggestionItem] = []
    seen = set()
    for group_id, lesson_date, start_time in sorted(slots, key=lambda row: (row[1], row[2] or dt_time(0, 0))):
        if (group_id, lesson_date) in seen:
            continue
        seen.add((group_id, lesson_date))
        group = next((item for item in groups_active if item.id == group_id), None) or db.query(Group).filter(Group.id == group_id).first()
        if not group:
            continue
        result.append(
            MakeupSuggestionItem(
                group_id=group_id,
                group_name=group.name,
                program_name=getattr(group, "direction", None),
                lesson_date=lesson_date,
                day_of_week=lesson_date.weekday(),
                start_time=start_time.strftime("%H:%M") if start_time else None,
            )
        )
    return result[:50]


def _get_sales_assignee(db: Session) -> User | None:
    return (
        db.query(User)
        .filter(User.role == UserRole.SALES, User.is_active.is_(True))
        .order_by(User.id.asc())
        .first()
    )


def queue_makeup_selection_request(db: Session, absence: AbsenceFollowUp, *, created_by: int | None) -> str | None:
    student = db.query(Student).filter(Student.id == absence.student_id).first()
    if not student or not student.parent_id:
        return None
    parent = db.query(User).filter(User.id == student.parent_id, User.is_active.is_(True)).first()
    if not parent:
        return None

    token = create_makeup_selection_token(absence_id=absence.id, student_id=absence.student_id)
    link = build_makeup_selection_link(token)
    if absence.stage == "missed":
        absence.stage = "link_sent"
    CommunicationService.send(
        db,
        channel="email",
        recipient_type="user",
        recipient_id=parent.id,
        created_by=created_by,
        dedupe_key=f"makeup-selection:{absence.id}",
        context={
            "subject": f"Выбор отработки для {student.full_name}",
            "message": (
                f"Здравствуйте, {parent.full_name}!\n\n"
                f"Для ученика {student.full_name} доступен выбор слота для отработки пропущенного занятия.\n"
                f"Откройте ссылку: {link}\n\n"
                f"Ссылка действует {MAKEUP_SELECTION_TOKEN_EXPIRE_DAYS} дней."
            ),
        },
    )
    return link


def create_sales_confirmation_task(
    db: Session,
    *,
    absence: AbsenceFollowUp,
    selected_group_name: str,
    created_by_id: int | None,
) -> None:
    sales_user = _get_sales_assignee(db)
    student = db.query(Student).filter(Student.id == absence.student_id).first()
    if not sales_user or not student:
        return

    task = Task(
        title=f"Родитель подтвердил отработку: {student.full_name}",
        description=(
            f"Ученик: {student.full_name}\n"
            f"Группа отработки: {selected_group_name}\n"
            f"Дата: {absence.makeup_lesson_date}"
        ),
        created_by_id=created_by_id or sales_user.id,
        assigned_to_id=sales_user.id,
        category="parents",
        status=TaskStatus.ACTIVE.value,
        tags=["makeup", "parent_confirmed"],
        scheduled_for=date.today(),
    )
    db.add(task)
    db.flush()
    db.add(TaskStudent(task_id=task.id, student_id=absence.student_id))


def close_send_link_tasks_for_absence(db: Session, *, absence_id: int) -> int:
    tasks = (
        db.query(Task)
        .filter(Task.status == TaskStatus.ACTIVE.value, Task.tags.isnot(None))
        .all()
    )
    closed = 0
    marker = f"absence:{absence_id}"
    for task in tasks:
        tags = task.tags or []
        if "send_link" in tags and marker in tags:
            task.status = TaskStatus.ARCHIVED.value
            closed += 1
    return closed
