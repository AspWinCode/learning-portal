"""
Бизнес-операции LEGO-направления: доступ по группам, оплаты с финансовой проводкой,
посещаемость. Не импортирует ничего из академических сервисов (student/group/lesson).
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import List, Optional, Sequence, Tuple

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import auth
from app.models import (
    FinanceTarget,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
    LEGO_LESSON_CANCELLED,
    LEGO_LESSON_COMPLETED,
    LEGO_TARGET_CODE,
    LegoAttendance,
    LegoGroup,
    LegoGroupStudent,
    LegoLesson,
    LegoPayment,
    LegoStudent,
    User,
)
from app.services.lego_payment_status import compute_monthly_period

LEGO_TARGET_NAME = "LEGO — Ленинец"


# ── Доступ ───────────────────────────────────────────────────────────────────

def sees_all_lego(user: User) -> bool:
    """Owner и пользователи с lego.manage видят все группы; остальные — только назначенные."""
    return auth.has_permission(user, "lego.manage")


def can_see_group(user: User, group: LegoGroup) -> bool:
    return sees_all_lego(user) or group.trainer_id == user.id


def visible_group_ids(db: Session, user: User) -> Optional[List[int]]:
    """None — видны все группы; иначе список id групп, назначенных пользователю."""
    if sees_all_lego(user):
        return None
    rows = db.query(LegoGroup.id).filter(LegoGroup.trainer_id == user.id).all()
    return [row.id for row in rows]


def can_see_student(db: Session, user: User, student: LegoStudent) -> bool:
    if sees_all_lego(user):
        return True
    group_ids = visible_group_ids(db, user) or []
    if not group_ids:
        return False
    return (
        db.query(LegoGroupStudent.id)
        .filter(
            LegoGroupStudent.lego_student_id == student.id,
            LegoGroupStudent.lego_group_id.in_(group_ids),
        )
        .first()
        is not None
    )


# ── Финансы ──────────────────────────────────────────────────────────────────

def get_or_create_leninets_target(db: Session) -> FinanceTarget:
    """Target `leninets` в общем finance-модуле. Создаётся при первом обращении (как в finance.create_finance_model)."""
    target = db.query(FinanceTarget).filter(FinanceTarget.code == LEGO_TARGET_CODE).first()
    if target is None:
        target = FinanceTarget(code=LEGO_TARGET_CODE, name=LEGO_TARGET_NAME, is_active=True)
        db.add(target)
        db.flush()
    return target


def register_payment(
    db: Session,
    student: LegoStudent,
    *,
    amount: Decimal,
    payment_date: date,
    created_by: int,
    comment: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Tuple[LegoPayment, bool]:
    """
    Регистрирует оплату LEGO-ребёнка. Возвращает (платёж, создан_ли_новый).

    Защита от двойного проведения:
    1. повторный запрос с тем же idempotency_key возвращает уже созданный платёж;
    2. строка ребёнка блокируется (SELECT FOR UPDATE), параллельные оплаты идут по очереди;
    3. проводка и платёж создаются в одной транзакции — либо оба, либо ни одного.
    """
    if idempotency_key:
        existing = db.query(LegoPayment).filter(LegoPayment.idempotency_key == idempotency_key).first()
        if existing is not None:
            return existing, False

    try:
        locked = (
            db.query(LegoStudent)
            .filter(LegoStudent.id == student.id)
            .with_for_update()
            .one()
        )
        period_start, period_end = compute_monthly_period(payment_date, locked.paid_until)
        target = get_or_create_leninets_target(db)

        tx = FinanceTransaction(
            occurred_at=datetime.combine(payment_date, time(12, 0), tzinfo=timezone.utc),
            amount=float(amount),
            direction=FinanceTransactionDirection.INCOME,
            target_id=target.id,
            status=FinanceTransactionStatus.CLASSIFIED,
            counterparty_name=(locked.parent_name or locked.full_name)[:512],
            counterparty_phone=locked.parent_phone,
            description_raw=f"LEGO: {locked.full_name}, период {period_start:%d.%m.%Y}–{period_end:%d.%m.%Y}",
        )
        db.add(tx)
        db.flush()

        payment = LegoPayment(
            student_id=locked.id,
            amount=amount,
            payment_date=payment_date,
            period_start=period_start,
            period_end=period_end,
            paid_until=period_end,
            finance_transaction_id=tx.id,
            idempotency_key=idempotency_key,
            comment=comment,
            created_by=created_by,
        )
        db.add(payment)

        locked.paid_until = period_end
        locked.next_payment_date = period_end + timedelta(days=1)
        db.commit()
        return payment, True
    except IntegrityError:
        # Гонка по idempotency_key: другой запрос уже провёл платёж.
        db.rollback()
        if idempotency_key:
            existing = db.query(LegoPayment).filter(LegoPayment.idempotency_key == idempotency_key).first()
            if existing is not None:
                return existing, False
        raise


# ── Посещаемость ─────────────────────────────────────────────────────────────

def roster_for_lesson(db: Session, lesson: LegoLesson) -> List[LegoStudent]:
    """Состав группы на дату занятия: активные участники, вступившие до даты и не выбывшие к ней."""
    rows = (
        db.query(LegoStudent)
        .join(LegoGroupStudent, LegoGroupStudent.lego_student_id == LegoStudent.id)
        .filter(
            LegoGroupStudent.lego_group_id == lesson.group_id,
            LegoGroupStudent.joined_at <= lesson.lesson_date,
            (LegoGroupStudent.left_at.is_(None)) | (LegoGroupStudent.left_at > lesson.lesson_date),
            LegoStudent.status == "active",
        )
        .order_by(LegoStudent.full_name)
        .all()
    )
    return rows


def upsert_attendance(
    db: Session,
    lesson: LegoLesson,
    records: Sequence[Tuple[int, bool, Optional[str]]],
    marked_by: int,
) -> int:
    """
    Сохраняет отметки. Повторное сохранение обновляет строку (unique lesson_id+student_id), а не дублирует.
    records: [(student_id, attended, comment)]. Возвращает число сохранённых отметок.
    """
    existing = {
        row.student_id: row
        for row in db.query(LegoAttendance).filter(LegoAttendance.lesson_id == lesson.id).all()
    }
    saved = 0
    for student_id, attended, comment in records:
        row = existing.get(student_id)
        if row is None:
            row = LegoAttendance(lesson_id=lesson.id, student_id=student_id)
            db.add(row)
        row.attended = bool(attended)
        row.comment = comment
        row.marked_by = marked_by
        saved += 1
    if lesson.status != LEGO_LESSON_CANCELLED:
        lesson.status = LEGO_LESSON_COMPLETED
    db.commit()
    return saved


def ensure_lesson_editable(lesson: LegoLesson) -> None:
    if lesson.status == LEGO_LESSON_CANCELLED:
        raise ValueError("Занятие отменено: отметки не сохраняются")


def amount_to_float(value) -> Optional[float]:
    if value is None:
        return None
    return float(value)
