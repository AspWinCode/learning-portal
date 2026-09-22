"""CAC/LTV/Retention: та же методика, что и в разделе «Финансы → Юнит-экономика»
(app/routers/finance.py, get_unit_economics), но без привязки к конкретной
финансовой модели/проекту — считает по всем операциям за произвольный период.
"""

from datetime import datetime
from typing import Dict, Optional, Set

from sqlalchemy.orm import Session

from app.models import FinanceArticle, FinanceTransaction, FinanceTransactionDirection


def _round(value: float, digits: int = 2) -> float:
    return round(float(value or 0.0), digits)


def _pct(numerator: float, denominator: float) -> float:
    return _round((float(numerator or 0.0) / float(denominator or 0.0)) * 100, 1) if denominator else 0.0


def _article_text(article: Optional[FinanceArticle]) -> str:
    if not article:
        return ""
    return f"{article.code or ''} {article.name or ''}".strip().lower()


def _is_marketing_sales(article: Optional[FinanceArticle]) -> bool:
    text = _article_text(article)
    return any(
        needle in text
        for needle in (
            "marketing", "sales", "lead", "cpl", "cac", "реклам", "маркет",
            "продаж", "лид", "заявк", "таргет", "авито", "директ",
        )
    )


def _is_variable_cost(article: Optional[FinanceArticle]) -> bool:
    from app.models import FinanceArticleCostKind

    if article and article.cost_kind == FinanceArticleCostKind.VARIABLE:
        return True
    text = _article_text(article)
    return any(
        needle in text
        for needle in (
            "teacher", "trainer", "platform", "commission", "преподав", "педагог",
            "тренер", "куратор", "методист", "платформ", "лиценз", "комисс", "эквайр",
        )
    )


def compute_unit_economics_kpis(
    db: Session,
    *,
    period_start: datetime,
    period_end: datetime,
    prev_start: datetime,
    prev_end: datetime,
) -> Dict[str, object]:
    from sqlalchemy.orm import joinedload

    transactions = (
        db.query(FinanceTransaction)
        .options(joinedload(FinanceTransaction.article))
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            FinanceTransaction.direction.in_([FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]),
        )
        .all()
    )

    revenue = 0.0
    variable_cost = 0.0
    marketing_sales_cost = 0.0
    for tx in transactions:
        amount = abs(float(tx.amount or 0.0))
        if tx.direction == FinanceTransactionDirection.INCOME:
            revenue += amount
            continue
        article = getattr(tx, "article", None)
        if _is_marketing_sales(article):
            marketing_sales_cost += amount
        if _is_variable_cost(article):
            variable_cost += amount

    gross_profit = revenue - variable_cost
    gross_margin_pct = _pct(gross_profit, revenue)

    def _paid_student_ids(start: datetime, end: datetime) -> Set[int]:
        rows = (
            db.query(FinanceTransaction.student_id)
            .filter(
                FinanceTransaction.occurred_at >= start,
                FinanceTransaction.occurred_at <= end,
                FinanceTransaction.direction == FinanceTransactionDirection.INCOME,
                FinanceTransaction.student_id.isnot(None),
            )
            .distinct()
            .all()
        )
        return {int(row[0]) for row in rows if row[0] is not None}

    active_student_ids = _paid_student_ids(period_start, period_end)
    previous_student_ids = _paid_student_ids(prev_start, prev_end)
    churned_student_ids = previous_student_ids - active_student_ids

    from sqlalchemy import func as sqlfunc

    first_payment_rows = (
        db.query(FinanceTransaction.student_id, sqlfunc.min(FinanceTransaction.occurred_at))
        .filter(
            FinanceTransaction.direction == FinanceTransactionDirection.INCOME,
            FinanceTransaction.student_id.isnot(None),
        )
        .group_by(FinanceTransaction.student_id)
        .all()
    )
    first_payment_by_student = {int(sid): first_paid for sid, first_paid in first_payment_rows if sid and first_paid}
    new_student_ids = {
        sid for sid, first_paid in first_payment_by_student.items() if period_start <= first_paid <= period_end
    }

    active_students = len(active_student_ids)
    new_students = len(new_student_ids)
    churned_students = len(churned_student_ids)
    arpu = revenue / active_students if active_students else 0.0
    cac = marketing_sales_cost / new_students if new_students else 0.0
    monthly_gross_profit_per_student = gross_profit / active_students if active_students else 0.0
    churn_pct = _pct(churned_students, len(previous_student_ids))

    lifetime_months = (100 / churn_pct) if churn_pct else 0.0
    if not lifetime_months and first_payment_by_student:
        last_payment_rows = (
            db.query(FinanceTransaction.student_id, sqlfunc.max(FinanceTransaction.occurred_at))
            .filter(
                FinanceTransaction.direction == FinanceTransactionDirection.INCOME,
                FinanceTransaction.student_id.isnot(None),
            )
            .group_by(FinanceTransaction.student_id)
            .all()
        )
        last_payment_by_student = {int(sid): last_paid for sid, last_paid in last_payment_rows if sid and last_paid}
        observed = []
        for sid, first_paid in first_payment_by_student.items():
            last_paid = last_payment_by_student.get(sid)
            if last_paid:
                observed.append(max(1, (last_paid.year - first_paid.year) * 12 + last_paid.month - first_paid.month + 1))
        lifetime_months = sum(observed) / len(observed) if observed else 0.0

    ltv = arpu * (gross_margin_pct / 100) * lifetime_months
    ltv_cac_ratio = ltv / cac if cac else 0.0
    payback_months = cac / monthly_gross_profit_per_student if monthly_gross_profit_per_student > 0 and cac else 0.0

    import calendar as _cal

    def _has_income_in_month(student_id: int, months_after: int) -> bool:
        first_paid = first_payment_by_student.get(student_id)
        if not first_paid:
            return False
        total_month = first_paid.month + months_after
        y = first_paid.year + (total_month - 1) // 12
        m = ((total_month - 1) % 12) + 1
        start = datetime(y, m, 1, tzinfo=first_paid.tzinfo)
        end = datetime(y, m, _cal.monthrange(y, m)[1], 23, 59, 59, tzinfo=first_paid.tzinfo)
        return (
            db.query(FinanceTransaction.id)
            .filter(
                FinanceTransaction.student_id == student_id,
                FinanceTransaction.direction == FinanceTransactionDirection.INCOME,
                FinanceTransaction.occurred_at >= start,
                FinanceTransaction.occurred_at <= end,
            )
            .first()
            is not None
        )

    def _retention(student_ids: Set[int], months_after: int) -> float:
        if not student_ids:
            return 0.0
        retained = sum(1 for sid in student_ids if _has_income_in_month(sid, months_after))
        return _pct(retained, len(student_ids))

    return {
        "revenue": _round(revenue),
        "marketing_sales_cost": _round(marketing_sales_cost),
        "variable_cost": _round(variable_cost),
        "gross_profit": _round(gross_profit),
        "gross_margin_pct": _round(gross_margin_pct, 1),
        "active_students": active_students,
        "new_students": new_students,
        "churned_students": churned_students,
        "arpu": _round(arpu),
        "cac": _round(cac),
        "monthly_gross_profit_per_student": _round(monthly_gross_profit_per_student),
        "churn_pct": _round(churn_pct, 1),
        "lifetime_months": _round(lifetime_months, 1),
        "ltv": _round(ltv),
        "ltv_cac_ratio": _round(ltv_cac_ratio, 2),
        "payback_months": _round(payback_months, 1),
        "retention_3_pct": _retention(new_student_ids, 3),
        "retention_6_pct": _retention(new_student_ids, 6),
        "retention_12_pct": _retention(new_student_ids, 12),
    }
