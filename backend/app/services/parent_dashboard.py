from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    CourseCatalogItem,
    Grade,
    Group,
    GroupSchedule,
    GroupStudent,
    LessonAttendance,
    Module,
    OwnerWorkspaceWebPushSubscription,
    ParentQuestion,
    Student,
    StudentAccount,
    StudentCard,
    StudentCourseProgress,
    StudentProgram,
    StudentStatus,
    Topic,
    User,
)
from app.services.ai_insights import build_student_learning_ai_snapshot
from app.services.owner_workspace_notifications import (
    _send_web_push,
    get_web_push_public_key,
    is_web_push_configured,
)
from app.services.telegram import notify_admins, notify_user


def get_parent_students(db: Session, parent_user_id: int) -> List[Student]:
    return (
        db.query(Student)
        .filter(Student.parent_id == parent_user_id, Student.status == StudentStatus.ACTIVE)
        .order_by(Student.full_name.asc())
        .all()
    )


def _resolve_nearest_lesson(
    db: Session,
    student_id: int,
    *,
    today: Optional[date] = None,
    horizon_days: int = 21,
) -> Optional[Dict[str, Any]]:
    current_day = today or date.today()
    now_dt = datetime.now()
    memberships = (
        db.query(GroupStudent)
        .join(Group, Group.id == GroupStudent.group_id)
        .filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
        )
        .all()
    )
    best: Optional[Dict[str, Any]] = None
    for membership in memberships:
        group = membership.group
        if group is None:
            continue
        schedules = (
            db.query(GroupSchedule)
            .filter(GroupSchedule.group_id == group.id)
            .order_by(GroupSchedule.day_of_week.asc(), GroupSchedule.start_time.asc())
            .all()
        )
        for schedule in schedules:
            days_ahead = (int(schedule.day_of_week) - current_day.weekday()) % 7
            candidate_date = current_day + timedelta(days=days_ahead)
            candidate_dt = datetime.combine(candidate_date, schedule.start_time)
            if candidate_dt < now_dt:
                candidate_date = candidate_date + timedelta(days=7)
                candidate_dt = datetime.combine(candidate_date, schedule.start_time)
            if candidate_date < current_day:
                continue
            if candidate_date > current_day + timedelta(days=horizon_days):
                continue
            candidate = {
                "group_id": group.id,
                "group_name": group.name,
                "lesson_date": candidate_date,
                "start_time": schedule.start_time,
                "end_time": schedule.end_time,
                "trainer_id": group.trainer_id,
                "trainer_name": group.trainer.full_name if group.trainer else None,
            }
            if best is None:
                best = candidate
                continue
            best_dt = datetime.combine(best["lesson_date"], best["start_time"])
            if candidate_dt < best_dt:
                best = candidate
    return best


def build_parent_dashboard_summary(db: Session, parent_user_id: int) -> Dict[str, Any]:
    students = get_parent_students(db, parent_user_id)
    items: List[Dict[str, Any]] = []
    for student in students:
        card = (
            db.query(StudentCard)
            .filter(StudentCard.student_id == student.id, StudentCard.archived.is_(False))
            .first()
        )
        balance = (
            db.query(func.coalesce(func.sum(StudentAccount.balance), 0.0))
            .filter(StudentAccount.student_id == student.id)
            .scalar()
            or 0.0
        )
        progress_rows = (
            db.query(StudentCourseProgress, CourseCatalogItem)
            .join(CourseCatalogItem, CourseCatalogItem.id == StudentCourseProgress.catalog_item_id)
            .filter(StudentCourseProgress.student_id == student.id)
            .all()
        )
        course_progress = [
            {
                "course_code": ci.code,
                "course_name": ci.name,
                "cases_solved": p.cases_solved,
                "cases_total": p.cases_total,
                "rank_name": p.rank_name,
                "badges_count": p.badges_count,
                "last_badge_name": p.last_badge_name,
                "updated_at": p.updated_at,
            }
            for p, ci in progress_rows
        ]
        items.append(
            {
                "student_id": student.id,
                "student_name": student.full_name,
                "current_balance": round(float(balance), 2),
                "next_payment_date": getattr(card, "next_payment_date", None),
                "payment_link": getattr(card, "payment_link", None),
                "nearest_lesson": _resolve_nearest_lesson(db, student.id),
                "ai_insight": build_student_learning_ai_snapshot(db, student_id=student.id),
                "course_progress": course_progress,
            }
        )
    return {"students": items}


def _resolve_target_trainer_id(db: Session, student_id: int) -> Optional[int]:
    membership = (
        db.query(GroupStudent)
        .join(Group, Group.id == GroupStudent.group_id)
        .filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
            Group.trainer_id.isnot(None),
        )
        .order_by(GroupStudent.id.asc())
        .first()
    )
    if membership and membership.group:
        return membership.group.trainer_id
    return None


async def create_parent_question(
    db: Session,
    *,
    parent_user: User,
    student_id: int,
    topic: Optional[str],
    message: str,
) -> ParentQuestion:
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.parent_id == parent_user.id)
        .first()
    )
    if student is None:
        raise ValueError("Student not found")
    target_trainer_id = _resolve_target_trainer_id(db, student.id)
    row = ParentQuestion(
        parent_user_id=parent_user.id,
        student_id=student.id,
        target_trainer_id=target_trainer_id,
        topic=(topic or "").strip() or None,
        message=message.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    notice_lines = [
        "Новый вопрос из кабинета родителя",
        f"Родитель: {parent_user.full_name}",
        f"Ученик: {student.full_name}",
    ]
    if row.topic:
        notice_lines.append(f"Тема: {row.topic}")
    notice_lines.append(f"Сообщение: {row.message}")
    notice_text = "\n".join(notice_lines)

    try:
        if target_trainer_id:
            await notify_user(db, target_trainer_id, notice_text)
        await notify_admins(db, notice_text)
    except Exception:
        pass

    return row


def get_parent_web_push_status(db: Session, user_id: int) -> Dict[str, Any]:
    count = (
        db.query(func.count(OwnerWorkspaceWebPushSubscription.id))
        .filter(OwnerWorkspaceWebPushSubscription.user_id == user_id)
        .scalar()
        or 0
    )
    public_key = get_web_push_public_key()
    return {
        "configured": bool(public_key),
        "public_key": public_key,
        "subscription_count": int(count),
    }


def upsert_parent_web_push_subscription(
    db: Session,
    *,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: Optional[str],
) -> Dict[str, Any]:
    row = (
        db.query(OwnerWorkspaceWebPushSubscription)
        .filter(OwnerWorkspaceWebPushSubscription.endpoint == endpoint)
        .first()
    )
    if row is None:
        row = OwnerWorkspaceWebPushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        db.add(row)
    else:
        row.user_id = user_id
        row.p256dh = p256dh
        row.auth = auth
        row.user_agent = user_agent
    db.commit()
    return get_parent_web_push_status(db, user_id)


def remove_parent_web_push_subscription(db: Session, *, user_id: int, endpoint: str) -> Dict[str, Any]:
    (
        db.query(OwnerWorkspaceWebPushSubscription)
        .filter(
            OwnerWorkspaceWebPushSubscription.user_id == user_id,
            OwnerWorkspaceWebPushSubscription.endpoint == endpoint,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return get_parent_web_push_status(db, user_id)


def send_characteristic_published_web_push(
    db: Session,
    *,
    user_id: int,
    student_name: str,
    period: str,
) -> None:
    if not is_web_push_configured():
        return
    subscriptions = (
        db.query(OwnerWorkspaceWebPushSubscription)
        .filter(OwnerWorkspaceWebPushSubscription.user_id == user_id)
        .all()
    )
    if not subscriptions:
        return
    payload = {
        "title": "Опубликована характеристика",
        "body": f"{student_name} • период {period}",
        "path": "/parent-dashboard",
        "kind": "parent_characteristic_published",
    }
    stale_ids: List[int] = []
    for subscription in subscriptions:
        try:
            _send_web_push(subscription, payload)
        except Exception:
            stale_ids.append(subscription.id)
    if stale_ids:
        (
            db.query(OwnerWorkspaceWebPushSubscription)
            .filter(OwnerWorkspaceWebPushSubscription.id.in_(stale_ids))
            .delete(synchronize_session=False)
        )
        db.commit()


def build_parent_weekly_digest_context(
    db: Session,
    *,
    student: Student,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    current_day = today or date.today()
    period_start = current_day - timedelta(days=7)
    period_start_dt = datetime.combine(period_start, datetime.min.time())
    period_end_dt = datetime.combine(current_day + timedelta(days=1), datetime.min.time())
    grade_rows = (
        db.query(Grade)
        .filter(Grade.student_id == student.id, Grade.date >= period_start_dt, Grade.date < period_end_dt)
        .all()
    )
    new_grades = len(grade_rows)
    lesson_rows = (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.student_id == student.id,
            LessonAttendance.lesson_date >= period_start,
            LessonAttendance.lesson_date <= current_day,
        )
        .all()
    )
    attended_count = sum(1 for row in lesson_rows if bool(row.attended))
    missed_count = max(len(lesson_rows) - attended_count, 0)

    active_program = (
        db.query(StudentProgram)
        .filter(StudentProgram.student_id == student.id)
        .order_by(StudentProgram.id.asc())
        .first()
    )
    total_topics = 0
    graded_topics = 0
    if active_program:
        topic_ids = [
            topic_id
            for (topic_id,) in (
                db.query(Topic.id)
                .join(Module, Module.id == Topic.module_id)
                .filter(Module.program_id == active_program.program_id)
                .all()
            )
        ]
        total_topics = len(topic_ids)
        if topic_ids:
            graded_topics = (
                db.query(func.count(func.distinct(Grade.topic_id)))
                .filter(Grade.student_id == student.id, Grade.topic_id.in_(topic_ids))
                .scalar()
                or 0
            )
    progress_percent = round((graded_topics / total_topics * 100.0), 2) if total_topics else 0.0
    nearest_lesson = _resolve_nearest_lesson(db, student.id, today=current_day)
    return {
        "student_name": student.full_name,
        "lessons_attended_count": attended_count,
        "lessons_missed_count": missed_count,
        "new_grades_count": new_grades,
        "progress_percent": progress_percent,
        "graded_topics": graded_topics,
        "total_topics": total_topics,
        "nearest_lesson_date": nearest_lesson["lesson_date"].isoformat() if nearest_lesson else "",
        "nearest_lesson_time": nearest_lesson["start_time"].strftime("%H:%M") if nearest_lesson else "",
        "nearest_lesson_group": nearest_lesson["group_name"] if nearest_lesson else "",
        "nearest_lesson_trainer": nearest_lesson["trainer_name"] if nearest_lesson else "",
    }
