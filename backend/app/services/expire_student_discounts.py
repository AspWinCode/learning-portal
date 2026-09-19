from __future__ import annotations

from datetime import date
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models import DiscountType, Student, StudentCard
from app.routers.action_log import log_action


def expire_student_discounts(db: Session) -> Dict[str, Any]:
    """Обнуляет скидку ученика (и её зеркало в карточке продаж), если истёк
    discount_valid_until — реализация «разовой» скидки (например, на 1 месяц),
    которая сама отключается без участия администратора.
    """
    today = date.today()

    students = (
        db.query(Student)
        .filter(
            Student.discount_valid_until.isnot(None),
            Student.discount_valid_until < today,
            Student.discount_type != DiscountType.NONE,
        )
        .all()
    )

    updated = 0
    for student in students:
        old_type = student.discount_type
        old_value = student.discount_value
        old_valid_until = student.discount_valid_until

        student.discount_type = DiscountType.NONE
        student.discount_value = 0.0
        student.discount_valid_until = None

        card = db.query(StudentCard).filter(StudentCard.student_id == student.id).first()
        if card:
            card.discount_type = DiscountType.NONE
            card.discount_value = 0.0
            card.discount_valid_until = None

        updated += 1
        log_action(
            db,
            user_id=None,
            action_type="student_discount_expired",
            entity_type="student",
            entity_id=student.id,
            details={
                "discount_type": getattr(old_type, "value", old_type),
                "discount_value": old_value,
                "discount_valid_until": old_valid_until.isoformat() if old_valid_until else None,
            },
        )

    db.commit()
    return {"updated": updated}
