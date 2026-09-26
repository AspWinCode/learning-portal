from __future__ import annotations

import calendar
import json
from datetime import date, datetime, timezone
from typing import Dict

from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from app.models import FinanceTransaction, FinanceTransactionDirection, MetricsSnapshot
from app.services.owner_dashboard import build_academy_metrics, build_owner_dashboard_summary
from app.utils.datetime import utcnow


def _month_bounds_utc(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = calendar.monthrange(year, month)[1]
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    return start, end


def _compute_finance_month_kpi(db: Session, period_start: datetime, period_end: datetime) -> Dict[str, object]:
    rows = (
        db.query(FinanceTransaction.direction, sqlfunc.sum(FinanceTransaction.amount))
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            FinanceTransaction.direction.in_([
                FinanceTransactionDirection.INCOME,
                FinanceTransactionDirection.EXPENSE,
            ]),
        )
        .group_by(FinanceTransaction.direction)
        .all()
    )
    income = expense = 0.0
    for direction, total in rows:
        if direction == FinanceTransactionDirection.INCOME:
            income = float(total or 0)
        else:
            expense = abs(float(total or 0))
    profit = income - expense
    margin = round(profit / income * 100, 1) if income else 0.0
    return {
        "income_month": round(income, 2),
        "expense_month": round(expense, 2),
        "net_profit_month": round(profit, 2),
        "net_margin_month": margin,
    }


def _json_safe(payload: Dict[str, object]) -> Dict[str, object]:
    """Прогоняет payload через JSON, чтобы date/datetime/enum и т.п. стали примитивами."""
    return json.loads(json.dumps(payload, default=str))


def _upsert_snapshot(db: Session, period_month: date, category: str, payload: Dict[str, object]) -> None:
    payload = _json_safe(payload)
    existing = (
        db.query(MetricsSnapshot)
        .filter(MetricsSnapshot.period_month == period_month, MetricsSnapshot.category == category)
        .first()
    )
    if existing is not None:
        existing.payload = payload
    else:
        db.add(MetricsSnapshot(period_month=period_month, category=category, payload=payload))


def capture_monthly_snapshots(db: Session) -> None:
    """Снимок ключевых показателей за текущий месяц (запускается в последний день месяца)."""
    now = utcnow()
    period_month = date(now.year, now.month, 1)
    period_start, period_end = _month_bounds_utc(now.year, now.month)

    owner_dashboard_payload = build_owner_dashboard_summary(db)
    academy_metrics_payload = build_academy_metrics(
        db,
        period_start=datetime(now.year, now.month, 1),
        period_end=period_end.replace(tzinfo=None),
    )
    finance_payload = _compute_finance_month_kpi(db, period_start, period_end)

    _upsert_snapshot(db, period_month, "owner_dashboard", owner_dashboard_payload)
    _upsert_snapshot(db, period_month, "academy_metrics", academy_metrics_payload)
    _upsert_snapshot(db, period_month, "finance", finance_payload)
    db.commit()
