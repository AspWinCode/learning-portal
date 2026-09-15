from datetime import date, datetime, time
from typing import Any, Optional


def lesson_duration_hours(start_time: Optional[time], end_time: Optional[time]) -> float:
    """Длительность занятия в часах по времени начала/конца (0, если не задано или некорректно)."""
    if not start_time or not end_time:
        return 0.0
    start_dt = datetime.combine(date.min, start_time)
    end_dt = datetime.combine(date.min, end_time)
    if end_dt <= start_dt:
        return 0.0
    return (end_dt - start_dt).total_seconds() / 3600.0


def apply_discount(price: float, discount_type: Any, discount_value: Optional[float]) -> float:
    amount = float(price or 0.0)
    kind = getattr(discount_type, "value", discount_type) or "none"
    value = float(discount_value or 0.0)
    if kind == "amount":
        amount = max(amount - value, 0.0)
    elif kind == "percent":
        amount = amount * (1 - min(max(value, 0.0), 100.0) / 100)
    return round(amount, 2)


def student_abonement_price(student: Any, abonement: Any) -> float:
    if not abonement:
        return 0.0
    return apply_discount(
        float(getattr(abonement, "price", 0.0) or 0.0),
        getattr(student, "discount_type", "none"),
        getattr(student, "discount_value", 0.0),
    )
