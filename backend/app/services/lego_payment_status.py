"""
Платёжный lifecycle LEGO-направления.

Намеренно не использует payment_status.py Академии (StudentCard, академические уроки,
StudentAccount). Все функции чистые: зависят только от дат и суммы, поэтому тестируются без БД.

Соглашение: paid_until — последний оплаченный день (включительно).
next_payment_date = paid_until + 1 день — день, с которого начинается новый период оплаты.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional, Tuple

STATUS_UNPAID = "unpaid"
STATUS_OK = "ok"
STATUS_DUE_SOON = "due_soon"
STATUS_OVERDUE = "overdue"
STATUS_OVERDUE_3 = "overdue_3"
STATUS_OVERDUE_10 = "overdue_10"

DUE_SOON_DAYS = 3
OVERDUE_3_DAYS = 3
OVERDUE_10_DAYS = 10


@dataclass(frozen=True)
class LegoPaymentStatus:
    status: str
    # Сколько дней до срока оплаты (0 — сегодня). None, если ещё ни разу не платил.
    days_until_due: Optional[int]
    # Сколько дней просрочки (0, если срок не прошёл).
    days_overdue: int


def add_months(value: date, months: int) -> date:
    """Сдвиг на календарные месяцы с зажимом дня (31 января + 1 месяц = 28/29 февраля)."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(value.day, last_day))


def compute_monthly_period(payment_date: date, paid_until: Optional[date]) -> Tuple[date, date]:
    """
    Период, который покрывает новый платёж.

    Если ребёнок оплачен вперёд (paid_until >= payment_date), новый период начинается
    сразу после paid_until, иначе — с даты платежа. Возвращает (period_start, period_end).
    """
    if paid_until is not None and paid_until >= payment_date:
        period_start = paid_until + timedelta(days=1)
    else:
        period_start = payment_date
    period_end = add_months(period_start, 1) - timedelta(days=1)
    return period_start, period_end


def compute_payment_status(
    today: date,
    paid_until: Optional[date],
    next_payment_date: Optional[date] = None,
) -> LegoPaymentStatus:
    """
    Статус оплаты на дату today.

    - unpaid: оплат не было (paid_until не задан);
    - due_soon: срок наступает в ближайшие DUE_SOON_DAYS дней (включая сегодня);
    - ok: оплачено, срок далеко;
    - overdue: просрочка 1–2 дня;
    - overdue_3: просрочка 3–9 дней;
    - overdue_10: просрочка 10 и более дней.
    """
    if paid_until is None:
        return LegoPaymentStatus(STATUS_UNPAID, None, 0)

    due = next_payment_date or (paid_until + timedelta(days=1))
    days_until = (due - today).days

    if days_until >= 0:
        status = STATUS_DUE_SOON if days_until <= DUE_SOON_DAYS else STATUS_OK
        return LegoPaymentStatus(status, days_until, 0)

    days_overdue = -days_until
    if days_overdue >= OVERDUE_10_DAYS:
        status = STATUS_OVERDUE_10
    elif days_overdue >= OVERDUE_3_DAYS:
        status = STATUS_OVERDUE_3
    else:
        status = STATUS_OVERDUE
    return LegoPaymentStatus(status, days_until, days_overdue)


# Фильтры экрана «Долги». Ключи совпадают с query-параметром API.
DEBT_FILTER_STATUSES = {
    "all": None,
    "due_soon": {STATUS_DUE_SOON},
    "overdue": {STATUS_OVERDUE, STATUS_OVERDUE_3, STATUS_OVERDUE_10},
    "overdue_3": {STATUS_OVERDUE_3, STATUS_OVERDUE_10},
    "overdue_10": {STATUS_OVERDUE_10},
    "unpaid": {STATUS_UNPAID},
}

# Статусы, которые считаются «долгом» для ожидаемой суммы задолженности.
DEBT_STATUSES = {STATUS_UNPAID, STATUS_OVERDUE, STATUS_OVERDUE_3, STATUS_OVERDUE_10}
