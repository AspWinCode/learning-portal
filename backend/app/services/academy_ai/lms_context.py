"""Read-only доступ ИИ-консультанта к данным LMS.

Каждый «инструмент» — чистая функция ``fn(db, user, **kwargs) -> dict`` с
агрегатами по существующим таблицам портала. Консультант НИКОГДА не пишет в LMS.

Доступ к каждому инструменту гейтится правами вызывающего пользователя
(``auth.has_permission``): владелец/админ (``*``) видят всё; у роли без нужного
права инструмент вернёт ``{"error": "no_permission", ...}`` вместо данных.

Инструменты регистрируются в ``TOOLS`` и вызываются оркестратором через
``run_tool`` / перечисляются через ``available_tools``.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import auth
from app.models import (
    B2BSchool,
    Characteristic,
    FinanceTransaction,
    Group,
    GroupStudent,
    Lead,
    Module,
    Program,
    SalesSchool,
    Student,
    StudentStatus,
)

ToolFn = Callable[..., Dict[str, Any]]


@dataclass(frozen=True)
class LmsTool:
    name: str
    permissions: Tuple[str, ...]  # нужны ВСЕ перечисленные права
    description: str
    fn: ToolFn


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _count_by(rows: List[Tuple[Any, int]]) -> Dict[str, int]:
    return {str(k if k is not None else "—"): int(v) for k, v in rows}


# ─── Инструменты ───────────────────────────────────────────────────────────

def schools_directory(db: Session, user, *, limit: int = 15) -> Dict[str, Any]:
    """Справочник школ: B2B-воронка партнёрств + справочник sales-школ."""
    by_stage = _count_by(
        db.query(B2BSchool.pipeline_stage, func.count(B2BSchool.id)).group_by(B2BSchool.pipeline_stage).all()
    )
    active_partners = 0
    for (partnership,) in db.query(B2BSchool.partnership).all():
        if isinstance(partnership, dict) and partnership.get("active_partner"):
            active_partners += 1
    top = (
        db.query(B2BSchool.name, B2BSchool.city, B2BSchool.pipeline_stage, B2BSchool.student_count)
        .order_by(B2BSchool.student_count.desc().nullslast())
        .limit(limit)
        .all()
    )
    return {
        "b2b_schools_total": db.query(func.count(B2BSchool.id)).scalar() or 0,
        "b2b_by_pipeline_stage": by_stage,
        "b2b_active_partners": active_partners,
        "sales_schools_total": db.query(func.count(SalesSchool.id)).filter(SalesSchool.is_active.is_(True)).scalar() or 0,
        "top_b2b_schools": [
            {"name": n, "city": c, "stage": s, "student_count": sc} for (n, c, s, sc) in top
        ],
    }


def finance_summary(db: Session, user, *, months: int = 3) -> Dict[str, Any]:
    """Доходы/расходы/сальдо за последние N месяцев (из единого финжурнала)."""
    since = _now() - timedelta(days=30 * max(1, months))
    rows = (
        db.query(FinanceTransaction.direction, func.coalesce(func.sum(FinanceTransaction.amount), 0.0))
        .filter(FinanceTransaction.occurred_at >= since)
        .group_by(FinanceTransaction.direction)
        .all()
    )
    totals = {str(getattr(d, "value", d)): round(float(a), 2) for d, a in rows}
    income = totals.get("income", 0.0)
    expense = totals.get("expense", 0.0)

    by_month: Dict[str, Dict[str, float]] = {}
    month_rows = (
        db.query(
            func.to_char(FinanceTransaction.occurred_at, "YYYY-MM"),
            FinanceTransaction.direction,
            func.coalesce(func.sum(FinanceTransaction.amount), 0.0),
        )
        .filter(FinanceTransaction.occurred_at >= since)
        .group_by(func.to_char(FinanceTransaction.occurred_at, "YYYY-MM"), FinanceTransaction.direction)
        .all()
    )
    for period, direction, amount in month_rows:
        bucket = by_month.setdefault(str(period), {})
        bucket[str(getattr(direction, "value", direction))] = round(float(amount), 2)

    return {
        "period_months": months,
        "since": since.date().isoformat(),
        "income_total": income,
        "expense_total": expense,
        "net": round(income - expense, 2),
        "by_month": dict(sorted(by_month.items())),
    }


def students_overview(db: Session, user) -> Dict[str, Any]:
    """Сводка по ученикам: статусы, приток, привязка родителей."""
    active = db.query(func.count(Student.id)).filter(Student.status == StudentStatus.ACTIVE).scalar() or 0
    archived = db.query(func.count(Student.id)).filter(Student.status == StudentStatus.ARCHIVED).scalar() or 0
    d30 = _now() - timedelta(days=30)
    d90 = _now() - timedelta(days=90)
    return {
        "active": int(active),
        "archived": int(archived),
        "new_last_30d": db.query(func.count(Student.id)).filter(Student.created_at >= d30).scalar() or 0,
        "new_last_90d": db.query(func.count(Student.id)).filter(Student.created_at >= d90).scalar() or 0,
        "with_parent_account": db.query(func.count(Student.id))
        .filter(Student.parent_id.isnot(None), Student.status == StudentStatus.ACTIVE)
        .scalar()
        or 0,
        "with_discount": db.query(func.count(Student.id))
        .filter(Student.discount_value > 0, Student.status == StudentStatus.ACTIVE)
        .scalar()
        or 0,
    }


def groups_load(db: Session, user) -> Dict[str, Any]:
    """Загрузка групп: по направлениям, средняя наполняемость, недобор."""
    active_groups = db.query(Group).filter(Group.status == "active")
    total = active_groups.count()
    by_direction = _count_by(
        db.query(Group.direction, func.count(Group.id)).filter(Group.status == "active").group_by(Group.direction).all()
    )
    size_rows = (
        db.query(GroupStudent.group_id, func.count(GroupStudent.id))
        .filter(GroupStudent.left_at.is_(None))
        .group_by(GroupStudent.group_id)
        .all()
    )
    sizes = [int(c) for _, c in size_rows]
    under_filled = sum(1 for c in sizes if c < 3)
    return {
        "active_groups": total,
        "by_direction": by_direction,
        "avg_group_size": round(sum(sizes) / len(sizes), 1) if sizes else 0.0,
        "under_filled_groups": under_filled,
        "individual_format": db.query(func.count(Group.id))
        .filter(Group.status == "active", Group.lesson_format == "individual")
        .scalar()
        or 0,
    }


def programs_catalog(db: Session, user, *, limit: int = 40) -> Dict[str, Any]:
    """Каталог программ обучения и число модулей в каждой."""
    module_counts = dict(
        db.query(Module.program_id, func.count(Module.id)).group_by(Module.program_id).all()
    )
    programs = db.query(Program.id, Program.name).filter(Program.status == "active").limit(limit).all()
    return {
        "active_programs": db.query(func.count(Program.id)).filter(Program.status == "active").scalar() or 0,
        "programs": [
            {"name": name, "modules": int(module_counts.get(pid, 0))} for pid, name in programs
        ],
    }


def sales_funnel(db: Session, user, *, days: int = 90) -> Dict[str, Any]:
    """Воронка продаж: лиды по статусам, конверсия, приток за период."""
    since = _now() - timedelta(days=days)
    by_status = _count_by(db.query(Lead.status, func.count(Lead.id)).group_by(Lead.status).all())
    won = by_status.get("won", 0)
    lost = by_status.get("lost", 0)
    closed = won + lost
    return {
        "period_days": days,
        "leads_by_status": by_status,
        "created_in_period": db.query(func.count(Lead.id)).filter(Lead.created_at >= since).scalar() or 0,
        "converted_in_period": db.query(func.count(Lead.id))
        .filter(Lead.created_at >= since, Lead.converted_to_student_id.isnot(None))
        .scalar()
        or 0,
        "win_rate_closed": round(won / closed, 3) if closed else None,
    }


def reviews_summary(db: Session, user, *, months: int = 6) -> Dict[str, Any]:
    """Характеристики учеников: объём и свежесть (сигнал вовлечённости/удержания)."""
    since = _now() - timedelta(days=30 * max(1, months))
    return {
        "characteristics_total": db.query(func.count(Characteristic.id)).scalar() or 0,
        "published_last_period": db.query(func.count(Characteristic.id))
        .filter(Characteristic.published_at >= since)
        .scalar()
        or 0,
        "students_with_characteristic": db.query(func.count(func.distinct(Characteristic.student_id))).scalar() or 0,
    }


# ─── Реестр инструментов ───────────────────────────────────────────────────

TOOLS: Dict[str, LmsTool] = {
    t.name: t
    for t in (
        LmsTool("schools_directory", ("b2b.access",), "Справочник школ и воронка B2B-партнёрств", schools_directory),
        LmsTool(
            "finance_summary",
            ("finance.access", "academy_ai.finance_context"),
            "Доходы, расходы и сальдо за последние месяцы",
            finance_summary,
        ),
        LmsTool("students_overview", ("students.access",), "Сводка по ученикам: статусы, приток, родители", students_overview),
        LmsTool("groups_load", ("groups.access",), "Загрузка и наполняемость групп по направлениям", groups_load),
        LmsTool("programs_catalog", ("programs.access",), "Каталог программ обучения и модулей", programs_catalog),
        LmsTool("sales_funnel", ("sales.access",), "Воронка продаж: лиды, статусы, конверсия", sales_funnel),
        LmsTool("reviews_summary", ("characteristics.access",), "Характеристики учеников: объём и свежесть", reviews_summary),
    )
}


def can_use(user, tool: LmsTool) -> bool:
    return all(auth.has_permission(user, perm) for perm in tool.permissions)


def available_tools(user) -> List[Dict[str, str]]:
    return [
        {"name": t.name, "description": t.description}
        for t in TOOLS.values()
        if can_use(user, t)
    ]


def run_tool(name: str, db: Session, user, **kwargs: Any) -> Dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": "unknown_tool", "tool": name}
    if not can_use(user, tool):
        missing = [p for p in tool.permissions if not auth.has_permission(user, p)]
        return {"error": "no_permission", "tool": name, "missing_permissions": missing}
    try:
        return {"tool": name, "data": tool.fn(db, user, **kwargs)}
    except TypeError as exc:
        return {"error": "bad_arguments", "tool": name, "detail": str(exc)}
