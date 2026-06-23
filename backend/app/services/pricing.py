from typing import Any, Optional


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
