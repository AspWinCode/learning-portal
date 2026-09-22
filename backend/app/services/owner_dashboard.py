from datetime import datetime, timedelta
from typing import Dict, List, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    AbsenceFollowUp,
    EventRegistration,
    EventRegistrationStatus,
    Group,
    GroupStatus,
    GroupStudent,
    Lead,
    LeadStatus,
    OwnerWorkspaceTask,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentStatus,
    User,
    UserRole,
)
from app.services.ai_insights import build_owner_ai_insights
from app.services.nps import build_nps_summary
from app.services.payment_status import get_payment_status_summary
from app.services.pricing import student_abonement_price
from app.services.unit_economics import compute_unit_economics_kpis
from app.utils.datetime import utcnow

ABONEMENT_FORMAT_LABELS = {
    "individual": "Индивидуальный",
    "package": "Пакетный",
    "group": "Групповой",
}
UNKNOWN_FORMAT_LABEL = "Не указан"


def _month_bounds(now: datetime) -> Tuple[datetime, datetime]:
    start_month = datetime(now.year, now.month, 1)
    if now.month == 12:
        end_month = datetime(now.year + 1, 1, 1)
    else:
        end_month = datetime(now.year, now.month + 1, 1)
    return start_month, end_month


def _build_daily_points(
    db: Session,
    *,
    days: int,
    now: datetime,
) -> Tuple[List[dict], List[dict]]:
    leads_points: List[dict] = []
    payments_points: List[dict] = []
    start_day = datetime(now.year, now.month, now.day) - timedelta(days=days - 1)
    for index in range(days):
        point_start = start_day + timedelta(days=index)
        point_end = point_start + timedelta(days=1)
        label = point_start.strftime("%d.%m")
        leads_value = (
            db.query(Lead)
            .filter(Lead.created_at >= point_start, Lead.created_at < point_end)
            .count()
        )
        payment_rows = (
            db.query(StudentAccountTransaction.amount)
            .filter(
                StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
                StudentAccountTransaction.created_at >= point_start,
                StudentAccountTransaction.created_at < point_end,
            )
            .all()
        )
        payments_value = round(sum(float(row[0] or 0) for row in payment_rows), 2)
        leads_points.append({"label": label, "value": int(leads_value)})
        payments_points.append({"label": label, "value": float(payments_value)})
    return leads_points, payments_points


def build_owner_dashboard_summary(db: Session) -> Dict[str, object]:
    now = utcnow()
    start_today = datetime(now.year, now.month, now.day)
    end_today = start_today + timedelta(days=1)
    start_month, end_month = _month_bounds(now)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    active_students = db.query(Student).filter(Student.status == StudentStatus.ACTIVE).count()
    active_groups = db.query(Group).filter(Group.status == GroupStatus.ACTIVE).count()
    active_trainers = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .count()
    )
    active_sales_managers = (
        db.query(User)
        .filter(User.role == UserRole.SALES, User.is_active.is_(True))
        .count()
    )

    active_pipeline_statuses = [
        LeadStatus.NEW,
        LeadStatus.CONTACTED,
        LeadStatus.DEMO,
        LeadStatus.INVOICE_SENT,
    ]
    new_leads_today = (
        db.query(Lead)
        .filter(Lead.created_at >= start_today, Lead.created_at < end_today)
        .count()
    )
    new_leads_month = (
        db.query(Lead)
        .filter(Lead.created_at >= start_month, Lead.created_at < end_month)
        .count()
    )
    won_leads_month = (
        db.query(Lead)
        .filter(
            Lead.status == LeadStatus.WON,
            or_(
                (Lead.updated_at >= start_month) & (Lead.updated_at < end_month),
                (Lead.updated_at.is_(None)) & (Lead.created_at >= start_month) & (Lead.created_at < end_month),
            ),
        )
        .count()
    )
    active_pipeline_count = (
        db.query(Lead).filter(Lead.status.in_(active_pipeline_statuses)).count()
    )
    registered_events_month = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.status == EventRegistrationStatus.REGISTERED,
            EventRegistration.created_at >= start_month,
            EventRegistration.created_at < end_month,
        )
        .count()
    )

    payment_rows_month = (
        db.query(StudentAccountTransaction.amount)
        .filter(
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
            StudentAccountTransaction.created_at >= start_month,
            StudentAccountTransaction.created_at < end_month,
        )
        .all()
    )
    payments_received_month = round(sum(float(row[0] or 0) for row in payment_rows_month), 2)
    payments_transactions_month = len(payment_rows_month)
    payment_summary = get_payment_status_summary(db, today=now.date())

    owner_workspace_overdue_tasks = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.status.in_(("new", "in_progress", "waiting")),
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
        )
        .count()
    )
    owner_workspace_waiting_tasks = (
        db.query(OwnerWorkspaceTask)
        .filter(OwnerWorkspaceTask.status == "waiting")
        .count()
    )
    owner_workspace_completed_7_days = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.status == "completed",
            OwnerWorkspaceTask.completed_at.isnot(None),
            OwnerWorkspaceTask.completed_at >= d7,
        )
        .count()
    )
    completed_30_rows = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.status == "completed",
            OwnerWorkspaceTask.completed_at.isnot(None),
            OwnerWorkspaceTask.created_at.isnot(None),
            OwnerWorkspaceTask.completed_at >= d30,
        )
        .all()
    )
    owner_workspace_completed_30_days = len(completed_30_rows)
    cycle_durations = [
        (task.completed_at - task.created_at).total_seconds() / 86400.0
        for task in completed_30_rows
        if task.completed_at and task.created_at
    ]
    owner_workspace_avg_days_to_complete_30 = (
        round(sum(cycle_durations) / len(cycle_durations), 2) if cycle_durations else None
    )

    makeups_pending_total = (
        db.query(AbsenceFollowUp)
        .filter(AbsenceFollowUp.stage.in_(("missed", "link_sent", "assigned")))
        .count()
    )
    makeups_waiting_parent = (
        db.query(AbsenceFollowUp)
        .filter(AbsenceFollowUp.stage == "link_sent")
        .count()
    )
    makeups_assigned = (
        db.query(AbsenceFollowUp)
        .filter(AbsenceFollowUp.stage == "assigned")
        .count()
    )

    leads_last_14_days, payments_last_14_days = _build_daily_points(db, days=14, now=now)

    summary = {
        "generated_at": now,
        "month_label": start_month.strftime("%Y-%m"),
        "active_students": int(active_students),
        "active_groups": int(active_groups),
        "active_trainers": int(active_trainers),
        "active_sales_managers": int(active_sales_managers),
        "new_leads_today": int(new_leads_today),
        "new_leads_month": int(new_leads_month),
        "won_leads_month": int(won_leads_month),
        "active_pipeline_count": int(active_pipeline_count),
        "registered_events_month": int(registered_events_month),
        "payments_received_month": float(payments_received_month),
        "payments_transactions_month": int(payments_transactions_month),
        "overdue_payments_3_count": int(payment_summary["overdue_3_count"]),
        "overdue_payments_10_count": int(payment_summary["overdue_10_count"]),
        "owner_workspace_overdue_tasks": int(owner_workspace_overdue_tasks),
        "owner_workspace_waiting_tasks": int(owner_workspace_waiting_tasks),
        "owner_workspace_completed_7_days": int(owner_workspace_completed_7_days),
        "owner_workspace_completed_30_days": int(owner_workspace_completed_30_days),
        "owner_workspace_avg_days_to_complete_30": owner_workspace_avg_days_to_complete_30,
        "makeups_pending_total": int(makeups_pending_total),
        "makeups_waiting_parent": int(makeups_waiting_parent),
        "makeups_assigned": int(makeups_assigned),
        "leads_last_14_days": leads_last_14_days,
        "payments_last_14_days": payments_last_14_days,
    }
    summary["ai_insights"] = build_owner_ai_insights(summary)
    return summary


def build_academy_metrics(
    db: Session,
    *,
    period_start: datetime,
    period_end: datetime,
) -> Dict[str, object]:
    """Показатели академии за период: средний чек = цена абонемента (с учётом
    персональной скидки ученика), засчитанная один раз на ученика за период,
    если у него была хотя бы одна оплата — независимо от того, сколькими
    платежами (рассрочкой) он её вносил."""

    paying_student_ids = (
        db.query(StudentAccount.student_id)
        .join(StudentAccountTransaction, StudentAccountTransaction.account_id == StudentAccount.id)
        .filter(
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
            StudentAccountTransaction.created_at >= period_start,
            StudentAccountTransaction.created_at < period_end,
        )
        .distinct()
    )

    students = db.query(Student).filter(Student.id.in_(paying_student_ids)).all()

    format_buckets: Dict[str, List[float]] = {}
    student_checks: Dict[int, float] = {}
    for student in students:
        abonement = student.abonement
        check_amount = student_abonement_price(student, abonement)
        student_checks[student.id] = check_amount
        format_key = getattr(abonement, "abonement_format", None) or "unknown"
        format_buckets.setdefault(format_key, []).append(check_amount)

    breakdown = []
    total_sum = 0.0
    total_count = 0
    for format_key, amounts in format_buckets.items():
        bucket_sum = round(sum(amounts), 2)
        bucket_count = len(amounts)
        total_sum += bucket_sum
        total_count += bucket_count
        breakdown.append({
            "abonement_format": format_key,
            "format_label": ABONEMENT_FORMAT_LABELS.get(format_key, UNKNOWN_FORMAT_LABEL),
            "students_count": bucket_count,
            "total_amount": bucket_sum,
            "average_check": round(bucket_sum / bucket_count, 2) if bucket_count else 0.0,
        })
    breakdown.sort(key=lambda row: row["total_amount"], reverse=True)

    groups_breakdown = _build_groups_revenue(db, student_checks=student_checks)

    period_length = period_end - period_start
    prev_start = period_start - period_length
    prev_end = period_start
    unit_economics = compute_unit_economics_kpis(
        db,
        period_start=period_start,
        period_end=period_end,
        prev_start=prev_start,
        prev_end=prev_end,
    )

    nps = build_nps_summary(db, period_start=period_start, period_end=period_end)

    return {
        "period_start": period_start,
        "period_end": period_end,
        "students_count": total_count,
        "total_amount": round(total_sum, 2),
        "average_check": round(total_sum / total_count, 2) if total_count else 0.0,
        "breakdown_by_format": breakdown,
        "breakdown_by_group": groups_breakdown,
        "cac": unit_economics["cac"],
        "ltv": unit_economics["ltv"],
        "ltv_cac_ratio": unit_economics["ltv_cac_ratio"],
        "retention_3_pct": unit_economics["retention_3_pct"],
        "retention_6_pct": unit_economics["retention_6_pct"],
        "retention_12_pct": unit_economics["retention_12_pct"],
        "nps": nps,
    }


def _build_groups_revenue(db: Session, *, student_checks: Dict[int, float]) -> List[dict]:
    """Выручка группы = сумма чеков (см. build_academy_metrics) учеников,
    у которых сейчас активное членство в этой группе (GroupStudent.left_at IS NULL)
    и которые заплатили в выбранном периоде. Ученик без активной группы
    (например, чисто индивидуальный) в этот срез не попадает.
    Группы «Летний интенсив» из этой разбивки исключены по запросу владельца."""

    if not student_checks:
        return []

    memberships = (
        db.query(GroupStudent.group_id, GroupStudent.student_id)
        .filter(
            GroupStudent.student_id.in_(student_checks.keys()),
            GroupStudent.left_at.is_(None),
        )
        .all()
    )

    group_student_map: Dict[int, List[int]] = {}
    for group_id, student_id in memberships:
        group_student_map.setdefault(group_id, []).append(student_id)

    if not group_student_map:
        return []

    groups = db.query(Group).filter(Group.id.in_(group_student_map.keys())).all()
    groups = [group for group in groups if "летний интенсив" not in (group.name or "").strip().lower()]
    trainer_ids = {group.trainer_id for group in groups if group.trainer_id}
    trainers = {
        user.id: user.full_name
        for user in db.query(User).filter(User.id.in_(trainer_ids)).all()
    } if trainer_ids else {}

    rows = []
    for group in groups:
        student_ids = group_student_map.get(group.id, [])
        amounts = [student_checks[sid] for sid in student_ids]
        bucket_sum = round(sum(amounts), 2)
        bucket_count = len(amounts)
        rows.append({
            "group_id": group.id,
            "group_name": group.name,
            "trainer_name": trainers.get(group.trainer_id),
            "students_count": bucket_count,
            "total_amount": bucket_sum,
            "average_check": round(bucket_sum / bucket_count, 2) if bucket_count else 0.0,
        })
    rows.sort(key=lambda row: row["total_amount"], reverse=True)
    return rows
