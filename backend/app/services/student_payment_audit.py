"""
Диагностическая сверка оплат и занятий по ученикам (owner-only).

Только чтение. Источник истины по оплатам — StudentAccountTransaction(kind=PAYMENT)
по ВСЕМ StudentAccount ученика (их может быть несколько). Подсчёт занятий переиспользует
app.services.student_card_period (там уже верно учтены заморозки, будущие уроки,
пропущенные занятия как занимающие место в абонементе).

Ничего не меняет: нет db.add/db.commit/db.delete. Слияние дублей — отдельный, более
поздний этап, тут только диагностика.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import (
    Group,
    GroupStudent,
    LessonAttendance,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
    StudentStatus,
)
from app.services.student_account_payment import resolve_payment_format
from app.services.student_card_period import (
    count_attended_since_period_start,
    count_lessons_since_period_start,
)
from app.student_display import get_student_display_name

DANILOVA_DARIA_NAME = "данилова дарья"
GROUP_LESSON_THRESHOLD = 8


def _normalize_name(full_name: Optional[str]) -> str:
    return " ".join((full_name or "").strip().lower().split())


@dataclass
class PaymentRow:
    transaction_id: int
    account_id: int
    date: Optional[date]
    amount: float
    finance_transaction_id: Optional[int]
    payment_format: Optional[str]
    note: Optional[str]


@dataclass
class StudentAuditEntry:
    student_id: int
    student_name: str
    status: str
    on_grant: bool

    learning_format: str
    abonement_id: Optional[int] = None
    abonement_name: Optional[str] = None
    active_group_names: List[str] = field(default_factory=list)

    payment_count: int = 0
    payment_total: float = 0.0
    first_payment_date: Optional[date] = None
    last_payment_date: Optional[date] = None
    payments: List[PaymentRow] = field(default_factory=list)

    learning_period_start: Optional[date] = None
    period_state: str = "ok"  # ok | missing
    lessons_passed: Optional[int] = None
    lessons_attended: Optional[int] = None
    lessons_missed: Optional[int] = None
    lessons_remaining: Optional[int] = None
    lifetime_lessons_count: Optional[int] = None

    lifetime_lessons_passed: Optional[int] = None
    current_period_lessons: Optional[int] = None

    period_should_rollover: bool = False
    data_warning: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    possible_duplicate: bool = False
    duplicate_student_ids: List[int] = field(default_factory=list)


@dataclass
class DuplicatePaymentGroup:
    finance_transaction_id: int
    student_id: Optional[int]
    transactions: List[PaymentRow]


@dataclass
class StudentPaymentAuditSummary:
    students_total: int
    with_payments: int
    without_payments: int
    grant_students: int


@dataclass
class StudentPaymentAuditResult:
    summary: StudentPaymentAuditSummary
    students: List[StudentAuditEntry]
    possible_duplicate_payments: List[DuplicatePaymentGroup]
    danilova_daria: List[StudentAuditEntry] = field(default_factory=list)


def _fetch_all_payments(db: Session, student_ids: Optional[List[int]] = None) -> Dict[int, List[PaymentRow]]:
    """Одним запросом — все PAYMENT-проводки по всем счетам, сгруппированные по student_id."""
    query = (
        db.query(
            StudentAccount.student_id,
            StudentAccountTransaction.id,
            StudentAccountTransaction.account_id,
            StudentAccountTransaction.created_at,
            StudentAccountTransaction.amount,
            StudentAccountTransaction.finance_transaction_id,
            StudentAccountTransaction.payment_format,
            StudentAccountTransaction.note,
        )
        .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
        .filter(StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT)
    )
    if student_ids is not None:
        query = query.filter(StudentAccount.student_id.in_(student_ids))

    result: Dict[int, List[PaymentRow]] = defaultdict(list)
    for student_id, tx_id, account_id, created_at, amount, finance_transaction_id, payment_format, note in query.all():
        tx_date = created_at.date() if isinstance(created_at, datetime) else created_at
        result[student_id].append(
            PaymentRow(
                transaction_id=tx_id,
                account_id=account_id,
                date=tx_date,
                amount=float(amount or 0),
                finance_transaction_id=finance_transaction_id,
                payment_format=payment_format,
                note=note,
            )
        )
    for rows in result.values():
        rows.sort(key=lambda r: (r.date or date.min, r.transaction_id))
    return result


def _fetch_active_group_membership(db: Session, student_ids: Optional[List[int]] = None) -> Dict[int, List[Group]]:
    query = (
        db.query(GroupStudent.student_id, Group)
        .join(Group, Group.id == GroupStudent.group_id)
        .filter(GroupStudent.left_at.is_(None))
    )
    if student_ids is not None:
        query = query.filter(GroupStudent.student_id.in_(student_ids))

    result: Dict[int, List[Group]] = defaultdict(list)
    for student_id, group in query.all():
        result[student_id].append(group)
    return result


def detect_possible_duplicate_students(db: Session) -> Dict[str, List[int]]:
    """Группирует ВСЕХ учеников (любого статуса) по нормализованному ФИО; возвращает только группы с >1 id."""
    rows = db.query(Student.id, Student.full_name).all()
    by_name: Dict[str, List[int]] = defaultdict(list)
    for student_id, full_name in rows:
        key = _normalize_name(full_name)
        if key:
            by_name[key].append(student_id)
    return {name: ids for name, ids in by_name.items() if len(ids) > 1}


def detect_possible_duplicate_payments(db: Session) -> List[DuplicatePaymentGroup]:
    """Несколько PAYMENT-проводок, ссылающихся на один и тот же finance_transaction_id."""
    rows = (
        db.query(
            StudentAccount.student_id,
            StudentAccountTransaction.id,
            StudentAccountTransaction.account_id,
            StudentAccountTransaction.created_at,
            StudentAccountTransaction.amount,
            StudentAccountTransaction.finance_transaction_id,
            StudentAccountTransaction.payment_format,
            StudentAccountTransaction.note,
        )
        .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
        .filter(
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
            StudentAccountTransaction.finance_transaction_id.isnot(None),
        )
        .all()
    )
    by_finance_tx: Dict[int, List[tuple]] = defaultdict(list)
    for row in rows:
        by_finance_tx[row.finance_transaction_id].append(row)

    groups: List[DuplicatePaymentGroup] = []
    for finance_transaction_id, group_rows in by_finance_tx.items():
        if len(group_rows) <= 1:
            continue
        student_ids = {r.student_id for r in group_rows}
        groups.append(
            DuplicatePaymentGroup(
                finance_transaction_id=finance_transaction_id,
                student_id=group_rows[0].student_id if len(student_ids) == 1 else None,
                transactions=[
                    PaymentRow(
                        transaction_id=r.id,
                        account_id=r.account_id,
                        date=r.created_at.date() if isinstance(r.created_at, datetime) else r.created_at,
                        amount=float(r.amount or 0),
                        finance_transaction_id=r.finance_transaction_id,
                        payment_format=r.payment_format,
                        note=r.note,
                    )
                    for r in group_rows
                ],
            )
        )
    return groups


def _build_student_entry(
    db: Session,
    student: Student,
    card: Optional[StudentCard],
    payments: List[PaymentRow],
    active_groups: List[Group],
    today: date,
) -> StudentAuditEntry:
    on_grant = bool(student.on_grant or (card and card.on_grant))

    learning_format = resolve_payment_format(student)
    abonement = getattr(student, "abonement", None)
    active_group_names = [g.name for g in active_groups]

    entry = StudentAuditEntry(
        student_id=student.id,
        student_name=get_student_display_name(db, student),
        status=student.status.value if hasattr(student.status, "value") else str(student.status),
        on_grant=on_grant,
        learning_format=learning_format,
        abonement_id=getattr(abonement, "id", None),
        abonement_name=getattr(abonement, "name", None),
        active_group_names=active_group_names,
    )

    entry.payments = payments
    entry.payment_count = len(payments)
    entry.payment_total = round(sum(p.amount for p in payments), 2)
    if payments:
        entry.first_payment_date = payments[0].date
        entry.last_payment_date = payments[-1].date

    warnings: List[str] = []

    mismatched_groups = [g for g in active_groups if (g.lesson_format or "group") != learning_format]
    if mismatched_groups:
        warnings.append("format_mismatch")
        entry.data_warning = (
            f"Формат абонемента ({learning_format}) не совпадает с форматом активной группы "
            f"({mismatched_groups[0].lesson_format})"
        )

    payment_formats = {p.payment_format for p in payments if p.payment_format}
    if len(payment_formats) > 1:
        warnings.append("payment_format_mismatch")

    period_start = card.learning_period_start if card else None
    entry.learning_period_start = period_start

    if learning_format == "individual":
        entry.lifetime_lessons_passed = count_lessons_since_period_start(db, student.id, None)
        if period_start:
            entry.current_period_lessons = count_lessons_since_period_start(db, student.id, period_start)
        lessons_for_warnings = entry.lifetime_lessons_passed
    else:
        if period_start is None:
            entry.period_state = "missing"
            entry.data_warning = entry.data_warning or "Не задано начало текущего платёжного периода"
            warnings.append("missing_period_start")
            entry.lifetime_lessons_count = count_lessons_since_period_start(db, student.id, None)
            lessons_for_warnings = entry.lifetime_lessons_count
        else:
            lessons_passed = count_lessons_since_period_start(db, student.id, period_start)
            lessons_attended = count_attended_since_period_start(db, student.id, period_start)
            entry.lessons_passed = lessons_passed
            entry.lessons_attended = lessons_attended
            entry.lessons_missed = lessons_passed - lessons_attended
            entry.lessons_remaining = max(GROUP_LESSON_THRESHOLD - lessons_passed, 0)
            if lessons_passed > GROUP_LESSON_THRESHOLD:
                warnings.append("period_overflow")
                entry.period_should_rollover = True
            lessons_for_warnings = lessons_passed

    if not on_grant and (lessons_for_warnings or 0) > 0 and entry.payment_count == 0:
        warnings.append("no_payment_but_lessons")
    if entry.payment_count > 0 and (lessons_for_warnings or 0) == 0:
        warnings.append("payment_without_lessons")

    entry.warnings = warnings
    return entry


def _load_students_by_ids(db: Session, student_ids: List[int]) -> List[Student]:
    if not student_ids:
        return []
    return db.query(Student).filter(Student.id.in_(student_ids)).all()


def _build_entries_for_students(db: Session, students: List[Student], today: date) -> List[StudentAuditEntry]:
    student_ids = [s.id for s in students]
    cards_by_student = {
        c.student_id: c
        for c in db.query(StudentCard).filter(StudentCard.student_id.in_(student_ids)).all()
    }
    payments_by_student = _fetch_all_payments(db, student_ids)
    groups_by_student = _fetch_active_group_membership(db, student_ids)

    entries = []
    for student in students:
        entry = _build_student_entry(
            db,
            student,
            cards_by_student.get(student.id),
            payments_by_student.get(student.id, []),
            groups_by_student.get(student.id, []),
            today,
        )
        entries.append(entry)
    return entries


def build_student_payment_audit(db: Session, today: Optional[date] = None) -> StudentPaymentAuditResult:
    if today is None:
        today = date.today()

    students = db.query(Student).filter(Student.status == StudentStatus.ACTIVE).all()
    entries = _build_entries_for_students(db, students, today)
    entries.sort(key=lambda e: e.student_name)

    students_total = len(entries)
    grant_students = sum(1 for e in entries if e.on_grant)
    with_payments = sum(1 for e in entries if not e.on_grant and e.payment_count > 0)
    without_payments = sum(1 for e in entries if not e.on_grant and e.payment_count == 0)

    duplicate_name_groups = detect_possible_duplicate_students(db)
    duplicate_ids_by_student: Dict[int, List[int]] = {}
    for ids in duplicate_name_groups.values():
        for sid in ids:
            duplicate_ids_by_student[sid] = ids

    for entry in entries:
        dup_ids = duplicate_ids_by_student.get(entry.student_id)
        if dup_ids:
            entry.possible_duplicate = True
            entry.duplicate_student_ids = [i for i in dup_ids if i != entry.student_id]
            if "possible_duplicate" not in entry.warnings:
                entry.warnings.append("possible_duplicate")

    possible_duplicate_payments = detect_possible_duplicate_payments(db)

    return StudentPaymentAuditResult(
        summary=StudentPaymentAuditSummary(
            students_total=students_total,
            with_payments=with_payments,
            without_payments=without_payments,
            grant_students=grant_students,
        ),
        students=entries,
        possible_duplicate_payments=possible_duplicate_payments,
        danilova_daria=[],
    )


def build_danilova_daria_report(db: Session, today: Optional[date] = None) -> List[StudentAuditEntry]:
    """Отдельная детальная сверка по 'Данилова Дарья' — все совпадения, без слияния."""
    if today is None:
        today = date.today()

    all_students = db.query(Student).all()
    matches = [
        s for s in all_students
        if _normalize_name(s.full_name) == DANILOVA_DARIA_NAME
        or _normalize_name(s.full_name).startswith(DANILOVA_DARIA_NAME + " ")
    ]
    if not matches:
        return []

    entries = _build_entries_for_students(db, matches, today)
    if len(entries) > 1:
        ids = [e.student_id for e in entries]
        for entry in entries:
            entry.possible_duplicate = True
            entry.duplicate_student_ids = [i for i in ids if i != entry.student_id]
            if "possible_duplicate" not in entry.warnings:
                entry.warnings.append("possible_duplicate")
    entries.sort(key=lambda e: e.student_id)
    return entries
