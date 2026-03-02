from __future__ import annotations

from datetime import date
from typing import Dict, Any

from sqlalchemy.orm import Session

from app.models import StudentCard, Student, StudentStatus, AppSetting
from app.routers.action_log import log_action


def _parse_grade(raw: str) -> tuple[int | None, str]:
    """
    Разбирает строку класса вида "7А" / "10Б" / "9" на (номер, суффикс).
    Если в начале нет цифр — возвращает (None, raw).
    """
    s = (raw or "").strip()
    if not s:
        return None, ""
    num_str = ""
    i = 0
    while i < len(s) and s[i].isdigit():
        num_str += s[i]
        i += 1
    if not num_str:
        return None, s
    try:
        num = int(num_str)
    except ValueError:
        return None, s
    suffix = s[i:].strip()
    return num, suffix


def auto_promote_student_classes(db: Session) -> Dict[str, Any]:
    """
    Автоповышение класса ученика 1 сентября:
    - Берём класс из StudentCard.grade (например, "7А") и увеличиваем номер на +1.
    - Только для активных учеников (Student.status == active) и неархивных карточек.
    - Архивные ученики не затрагиваются.
    - Логируем изменения в ActionLog.
    - Чтобы задача была идемпотентной, используем AppSetting с ключом student_class_autopromo_<year>.
    """
    today = date.today()

    # Защита от случайного запуска не 1 сентября.
    if not (today.month == 9 and today.day == 1):
        return {"skipped": True, "reason": "not_september_first"}

    settings_key = f"student_class_autopromo_{today.year}"
    already_run = db.query(AppSetting).filter(AppSetting.key == settings_key).first()
    if already_run:
        return {"skipped": True, "reason": "already_run"}

    # Выбираем активных учеников и их карточки.
    cards = (
        db.query(StudentCard)
        .join(Student, StudentCard.student_id == Student.id)
        .filter(
            Student.status == StudentStatus.ACTIVE,
            StudentCard.archived.is_(False),
            StudentCard.grade.isnot(None),
        )
        .all()
    )

    updated = 0
    for card in cards:
        old_grade_raw = (card.grade or "").strip()
        if not old_grade_raw:
            continue
        num, suffix = _parse_grade(old_grade_raw)
        # Если номер нераспознан или уже выпускной (например, 11 класс) — не меняем.
        if not num or num >= 11:
            continue
        new_grade = f"{num + 1}{suffix}"
        if new_grade == old_grade_raw:
            continue

        card.grade = new_grade
        updated += 1

        # Логируем изменение класса.
        log_action(
            db,
            user_id=None,
            action_type="student_class_autopromo",
            entity_type="student_card",
            entity_id=card.id,
            details={
                "year": today.year,
                "old_grade": old_grade_raw,
                "new_grade": new_grade,
                "student_id": card.student_id,
            },
        )

    # Фиксируем, что за этот год автоповышение уже выполнено.
    setting = AppSetting(key=settings_key, value=today.isoformat())
    db.add(setting)
    db.commit()

    return {"updated": updated, "year": today.year}

