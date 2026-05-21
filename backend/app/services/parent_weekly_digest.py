from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models import AppSetting, Student, User
from app.services.communication_hub import CommunicationService
from app.services.parent_dashboard import build_parent_weekly_digest_context
from app.services.telegram import notify_user

PARENT_WEEKLY_DIGEST_SETTINGS_KEY = "parent_weekly_digest_settings"
DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS = {
    "enabled": True,
    "weekday": 4,
    "send_time": "09:00",
    "last_sent_on": None,
}


def get_parent_weekly_digest_settings(db: Session) -> Dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == PARENT_WEEKLY_DIGEST_SETTINGS_KEY).first()
    if row is None or not (row.value or "").strip():
        return dict(DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS)
    try:
        payload = json.loads(row.value)
    except Exception:
        return dict(DEFAULT_PARENT_WEEKLY_DIGEST_SETTINGS)
    return {
        "enabled": bool(payload.get("enabled", True)),
        "weekday": int(payload.get("weekday", 4)),
        "send_time": str(payload.get("send_time") or "09:00"),
        "last_sent_on": payload.get("last_sent_on"),
    }


def set_parent_weekly_digest_settings(db: Session, value: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {
        "enabled": bool(value.get("enabled", True)),
        "weekday": int(value.get("weekday", 4)),
        "send_time": str(value.get("send_time") or "09:00"),
        "last_sent_on": value.get("last_sent_on"),
    }
    raw = json.dumps(normalized, ensure_ascii=False)
    row = db.query(AppSetting).filter(AppSetting.key == PARENT_WEEKLY_DIGEST_SETTINGS_KEY).first()
    if row is None:
        row = AppSetting(key=PARENT_WEEKLY_DIGEST_SETTINGS_KEY, value=raw)
        db.add(row)
    else:
        row.value = raw
        db.add(row)
    db.commit()
    return normalized


def enqueue_parent_weekly_digests(db: Session, *, now: datetime | None = None) -> int:
    current = now or datetime.now()
    settings = get_parent_weekly_digest_settings(db)
    if not settings.get("enabled", True):
        return 0
    if int(settings.get("weekday", 4)) != current.weekday():
        return 0
    send_time = str(settings.get("send_time") or "09:00")
    try:
        send_hour = int(send_time[:2])
        send_minute = int(send_time[3:5])
    except Exception:
        send_hour, send_minute = 9, 0
    if (current.hour, current.minute) < (send_hour, send_minute):
        return 0
    today_key = current.date().isoformat()
    if settings.get("last_sent_on") == today_key:
        return 0

    students = (
        db.query(Student)
        .filter(Student.parent_id.isnot(None))
        .order_by(Student.parent_id.asc(), Student.id.asc())
        .all()
    )
    sent_count = 0
    for student in students:
        if not student.parent_id:
            continue
        parent = db.query(User).filter(User.id == student.parent_id).first()
        if parent is None:
            continue
        context = build_parent_weekly_digest_context(db, student=student, today=current.date())
        context["message"] = (
            f"Еженедельный отчёт по {context['student_name']}\n"
            f"Занятий был/была: {context['lessons_attended_count']}\n"
            f"Пропусков: {context['lessons_missed_count']}\n"
            f"Новых оценок: {context['new_grades_count']}\n"
            f"Прогресс программы: {context['progress_percent']}%\n"
            f"Ближайшее занятие: {context['nearest_lesson_date']} {context['nearest_lesson_time']} {context['nearest_lesson_group']}"
        )
        context["subject"] = f"Weekly digest: {context['student_name']}"
        CommunicationService.send(
            db,
            channel="email",
            recipient_type="student",
            recipient_id=student.id,
            event_key="parent_weekly_digest",
            context=context,
        )
        try:
            if parent.telegram_chat_id:
                text = (
                    f"Еженедельный отчёт по {context['student_name']}\n"
                    f"Занятий: {context['lessons_attended_count']} посещено, {context['lessons_missed_count']} пропущено\n"
                    f"Новых оценок: {context['new_grades_count']}\n"
                    f"Прогресс: {context['progress_percent']}%\n"
                    f"Ближайшее занятие: {context['nearest_lesson_date']} {context['nearest_lesson_time']}"
                )
                import asyncio

                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(notify_user(db, parent.id, text))
                except RuntimeError:
                    asyncio.run(notify_user(db, parent.id, text))
        except Exception:
            pass
        sent_count += 1

    settings["last_sent_on"] = today_key
    set_parent_weekly_digest_settings(db, settings)
    return sent_count
