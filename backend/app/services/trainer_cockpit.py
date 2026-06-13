from collections import defaultdict
from datetime import date, datetime
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app import auth
from app.models import (
    Characteristic,
    CharacteristicStatus,
    Grade,
    Group,
    GroupProgram,
    GroupStudent,
    LessonAttendance,
    LessonTrainerOverride,
    Module,
    Program,
    Student,
    StudentProgram,
    StudentProgramLinkStatus,
    TopicStatus,
    User,
    UserRole,
)
from app.services.ai_insights import build_student_learning_ai_snapshot
from app.student_display import get_students_display_names


def _ensure_trainer_access(current_user: User) -> None:
    if auth.resolve_effective_role(current_user) != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer cockpit is available only for trainers",
        )


def _get_trainer_students(db: Session, trainer_id: int) -> List[Student]:
    return (
        db.query(Student)
        .join(GroupStudent, GroupStudent.student_id == Student.id)
        .join(Group, Group.id == GroupStudent.group_id)
        .filter(
            Student.status == "active",
            Group.trainer_id == trainer_id,
            GroupStudent.left_at.is_(None),
        )
        .options(
            selectinload(Student.student_programs).joinedload(StudentProgram.program),
            selectinload(Student.group_students).joinedload(GroupStudent.group),
        )
        .distinct()
        .all()
    )


def _resolve_program_for_student(db: Session, student_id: int, trainer_id: int) -> Optional[Program]:
    direct_link = (
        db.query(StudentProgram)
        .options(joinedload(StudentProgram.program).joinedload(Program.modules).joinedload(Module.topics))
        .filter(
            StudentProgram.student_id == student_id,
            StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
        )
        .order_by(StudentProgram.created_at.desc())
        .first()
    )
    if direct_link and direct_link.program:
        return direct_link.program

    group_program = (
        db.query(GroupProgram)
        .join(Group, Group.id == GroupProgram.group_id)
        .join(GroupStudent, GroupStudent.group_id == Group.id)
        .options(joinedload(GroupProgram.program).joinedload(Program.modules).joinedload(Module.topics))
        .filter(
            Group.trainer_id == trainer_id,
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
        )
        .order_by(GroupProgram.created_at.desc())
        .first()
    )
    if group_program and group_program.program:
        return group_program.program
    return None


def _build_progress_snapshot(db: Session, student_id: int, trainer_id: int) -> Dict[str, Optional[object]]:
    program = _resolve_program_for_student(db, student_id, trainer_id)
    if not program:
        return {
            "program_name": None,
            "progress_percent": 0.0,
            "graded_topics": 0,
            "total_topics": 0,
        }

    active_topic_ids: List[int] = []
    for module in sorted(program.modules or [], key=lambda item: item.order or 0):
        for topic in sorted(module.topics or [], key=lambda item: item.order or 0):
            if topic.status == TopicStatus.ACTIVE:
                active_topic_ids.append(topic.id)

    if not active_topic_ids:
        return {
            "program_name": program.name,
            "progress_percent": 0.0,
            "graded_topics": 0,
            "total_topics": 0,
        }

    graded_topic_ids = {
        row[0]
        for row in (
            db.query(Grade.topic_id)
            .filter(
                Grade.student_id == student_id,
                Grade.topic_id.in_(active_topic_ids),
            )
            .distinct()
            .all()
        )
    }
    total_topics = len(active_topic_ids)
    graded_topics = len(graded_topic_ids)
    progress_percent = round((graded_topics / total_topics * 100.0), 2) if total_topics else 0.0
    return {
        "program_name": program.name,
        "progress_percent": progress_percent,
        "graded_topics": graded_topics,
        "total_topics": total_topics,
    }


def build_trainer_cockpit_summary(
    db: Session,
    *,
    current_user: User,
    today: Optional[date] = None,
) -> Dict[str, object]:
    _ensure_trainer_access(current_user)
    current_day = today or date.today()
    trainer_id = current_user.id

    students = _get_trainer_students(db, trainer_id)
    display_names = get_students_display_names(db, [student.id for student in students]) if students else {}

    primary_group_names: Dict[int, Optional[str]] = {}
    for student in students:
        active_group = next(
            (
                group_student.group
                for group_student in (student.group_students or [])
                if getattr(group_student, "left_at", None) is None
                and getattr(group_student.group, "trainer_id", None) == trainer_id
            ),
            None,
        )
        primary_group_names[student.id] = active_group.name if active_group else None

    progress_items: List[Dict[str, object]] = []
    for student in students:
        snapshot = _build_progress_snapshot(db, student.id, trainer_id)
        ai_snapshot = build_student_learning_ai_snapshot(db, student_id=student.id, today=current_day)
        progress_items.append(
            {
                "student_id": student.id,
                "student_name": display_names.get(student.id, student.full_name),
                "group_name": primary_group_names.get(student.id),
                "program_name": snapshot["program_name"],
                "progress_percent": snapshot["progress_percent"],
                "graded_topics": snapshot["graded_topics"],
                "total_topics": snapshot["total_topics"],
                "ai_insight": ai_snapshot,
            }
        )
    progress_items.sort(key=lambda item: (-float(item["progress_percent"]), str(item["student_name"])))

    attendance_rows = (
        db.query(
            LessonAttendance.student_id,
            LessonAttendance.lesson_date,
            Group.name.label("group_name"),
        )
        .join(Group, Group.id == LessonAttendance.group_id)
        .filter(
            Group.trainer_id == trainer_id,
            LessonAttendance.attended.is_(True),
            LessonAttendance.lesson_date <= current_day,
        )
        .order_by(LessonAttendance.student_id.asc(), LessonAttendance.lesson_date.desc())
        .all()
    )
    attendance_by_student: Dict[int, List[Dict[str, object]]] = defaultdict(list)
    for row in attendance_rows:
        attendance_by_student[int(row.student_id)].append(
            {
                "lesson_date": row.lesson_date,
                "group_name": row.group_name,
            }
        )

    last_grade_rows = (
        db.query(Grade.student_id, func.max(Grade.date).label("last_grade_at"))
        .filter(Grade.trainer_id == trainer_id)
        .group_by(Grade.student_id)
        .all()
    )
    last_grade_map = {
        int(row.student_id): row.last_grade_at for row in last_grade_rows if row.student_id is not None
    }

    todo_grade_items: List[Dict[str, object]] = []
    for student in students:
        recent_attendances = attendance_by_student.get(student.id, [])
        unique_dates: List[date] = []
        for item in recent_attendances:
            lesson_date = item["lesson_date"]
            if lesson_date not in unique_dates:
                unique_dates.append(lesson_date)
            if len(unique_dates) >= 5:
                break
        if len(unique_dates) < 2:
            continue
        last_grade_at = last_grade_map.get(student.id)
        last_grade_day = last_grade_at.date() if isinstance(last_grade_at, datetime) else None
        lessons_without_grade = sum(1 for lesson_day in unique_dates if last_grade_day is None or lesson_day > last_grade_day)
        if lessons_without_grade < 2:
            continue
        todo_grade_items.append(
            {
                "student_id": student.id,
                "student_name": display_names.get(student.id, student.full_name),
                "group_name": recent_attendances[0]["group_name"] if recent_attendances else primary_group_names.get(student.id),
                "last_lesson_date": unique_dates[0],
                "lessons_without_grade_count": lessons_without_grade,
            }
        )
    todo_grade_items.sort(
        key=lambda item: (
            -int(item["lessons_without_grade_count"]),
            str(item["student_name"]),
        )
    )

    draft_characteristics = (
        db.query(Characteristic)
        .options(joinedload(Characteristic.student))
        .filter(
            Characteristic.trainer_id == trainer_id,
            Characteristic.status == CharacteristicStatus.DRAFT,
        )
        .order_by(Characteristic.created_at.asc())
        .limit(20)
        .all()
    )
    draft_characteristic_items = [
        {
            "characteristic_id": item.id,
            "student_id": item.student_id,
            "student_name": display_names.get(item.student_id, item.student.full_name if item.student else str(item.student_id)),
            "month": item.month,
            "year": item.year,
            "created_at": item.created_at,
        }
        for item in draft_characteristics
    ]

    characteristic_notifications_rows = (
        db.query(Characteristic)
        .options(joinedload(Characteristic.student))
        .filter(
            Characteristic.trainer_id == trainer_id,
            Characteristic.status.in_(
                [
                    CharacteristicStatus.PENDING,
                    CharacteristicStatus.APPROVED,
                    CharacteristicStatus.REJECTED,
                ]
            ),
        )
        .order_by(func.coalesce(Characteristic.updated_at, Characteristic.created_at).desc())
        .limit(10)
        .all()
    )
    characteristic_notifications = [
        {
            "notification_type": "characteristic_status",
            "status": str(item.status.value if hasattr(item.status, "value") else item.status),
            "title": "Статус характеристики изменён",
            "description": (
                f"{display_names.get(item.student_id, item.student.full_name if item.student else item.student_id)}"
                f" • {item.month:02d}/{item.year}"
            ),
            "created_at": item.published_at or item.updated_at or item.created_at,
        }
        for item in characteristic_notifications_rows
    ]

    substitution_rows = (
        db.query(LessonTrainerOverride, Group)
        .join(Group, Group.id == LessonTrainerOverride.group_id)
        .filter(
            LessonTrainerOverride.trainer_id == trainer_id,
            LessonTrainerOverride.lesson_date >= current_day,
            Group.trainer_id != trainer_id,
        )
        .order_by(LessonTrainerOverride.lesson_date.asc(), LessonTrainerOverride.start_time.asc())
        .limit(10)
        .all()
    )
    substitution_notifications = [
        {
            "notification_type": "substitution",
            "status": "scheduled",
            "title": "Подмена в расписании",
            "description": (
                f"{group.name} • {override.lesson_date.isoformat()} • "
                f"{override.start_time.strftime('%H:%M')}-{override.end_time.strftime('%H:%M')}"
            ),
            "created_at": datetime.combine(override.lesson_date, override.start_time),
        }
        for override, group in substitution_rows
    ]

    return {
        "todo_grade_items": todo_grade_items[:20],
        "draft_characteristics": draft_characteristic_items,
        "my_students": progress_items[:20],
        "characteristic_notifications": characteristic_notifications,
        "substitution_notifications": substitution_notifications,
    }
