"""
Интеграционные тесты диагностической сверки оплат и занятий
(app/services/student_payment_audit.py).

Работают против реальной БД, заданной DATABASE_URL (как остальные integration-тесты
в этом пакете, см. test_group_duration_billing.py) — сервис делает реальные JOIN/GROUP BY
агрегации по ВСЕЙ таблице students, которые нельзя надёжно воспроизвести через
in-memory SQLite (модель User содержит Postgres-only ARRAY колонку).

Каждый тест создаёт собственные строки с уникальными (uuid) ФИО/email и удаляет их
в finally. Проверки не полагаются на абсолютные значения summary (в dev-БД уже есть
другие активные ученики) — только на поля конкретно созданных записей.
"""
import uuid
from datetime import date, timedelta

import pytest

from tests.integration.conftest import _is_db_configured

pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

TODAY = date.today()


def _get_session():
    from app.database import SessionLocal
    return SessionLocal()


@pytest.fixture
def db():
    session = _get_session()
    try:
        yield session
    finally:
        session.close()


def _uniq(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


def _make_trainer(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_trainer_audit_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Trainer Audit",
        role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_abonement(db, abonement_format="group", lessons_count=8):
    from app.models import Abonement

    ab = Abonement(name=_uniq("Test Abonement"), price=10000.0, abonement_format=abonement_format, lessons_count=lessons_count)
    db.add(ab)
    db.commit()
    db.refresh(ab)
    return ab


def _make_group(db, trainer, lesson_format="group"):
    from app.models import Group, GroupStatus

    group = Group(
        name=_uniq("Test Group"),
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        lesson_format=lesson_format,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def _make_student(db, full_name, abonement=None, on_grant=False):
    from app.models import Student

    student = Student(full_name=full_name, abonement_id=abonement.id if abonement else None, on_grant=on_grant)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_card(db, student, learning_period_start=None, on_grant=False):
    from app.models import StudentCard

    card = StudentCard(
        student_id=student.id,
        student_full_name=student.full_name,
        learning_period_start=learning_period_start,
        on_grant=on_grant,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def _enroll(db, group, student):
    from app.models import GroupStudent

    gs = GroupStudent(group_id=group.id, student_id=student.id)
    db.add(gs)
    db.commit()
    return gs


def _make_account(db, student, name="Основной"):
    from app.models import StudentAccount

    account = StudentAccount(student_id=student.id, name=name, balance=0.0)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _make_payment(db, account, amount, finance_transaction_id=None, payment_format=None):
    from app.models import StudentAccountTransaction, StudentAccountTransactionKind

    tx = StudentAccountTransaction(
        account_id=account.id,
        amount=amount,
        kind=StudentAccountTransactionKind.PAYMENT,
        finance_transaction_id=finance_transaction_id,
        payment_format=payment_format,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _make_deduction(db, account, amount=-1000):
    from app.models import StudentAccountTransaction, StudentAccountTransactionKind

    tx = StudentAccountTransaction(
        account_id=account.id,
        amount=amount,
        kind=StudentAccountTransactionKind.LESSON_DEDUCTION,
    )
    db.add(tx)
    db.commit()
    return tx


def _make_lesson(db, group, student, lesson_date, attended=True, absence_reason=None):
    from app.models import LessonAttendance

    lesson = LessonAttendance(
        group_id=group.id,
        student_id=student.id,
        lesson_date=lesson_date,
        attended=attended,
        absence_reason=absence_reason,
    )
    db.add(lesson)
    db.commit()
    return lesson


def _cleanup(db, students, groups=None, abonements=None):
    from app.models import (
        Abonement,
        Group,
        GroupStudent,
        LessonAttendance,
        Student,
        StudentAccount,
        StudentAccountTransaction,
        StudentCard,
        StudentFreeze,
    )

    for s in students:
        db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.account_id.in_(
                db.query(StudentAccount.id).filter(StudentAccount.student_id == s.id)
            )
        ).delete(synchronize_session=False)
        db.query(StudentAccount).filter(StudentAccount.student_id == s.id).delete(synchronize_session=False)
        db.query(LessonAttendance).filter(LessonAttendance.student_id == s.id).delete(synchronize_session=False)
        db.query(GroupStudent).filter(GroupStudent.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentFreeze).filter(StudentFreeze.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentCard).filter(StudentCard.student_id == s.id).delete(synchronize_session=False)
        db.query(Student).filter(Student.id == s.id).delete(synchronize_session=False)
    for g in groups or []:
        db.query(Group).filter(Group.id == g.id).delete(synchronize_session=False)
    for ab in abonements or []:
        db.query(Abonement).filter(Abonement.id == ab.id).delete(synchronize_session=False)
    db.commit()


def _entry_for(result, student_id):
    return next(e for e in result.students if e.student_id == student_id)


# ---------------------------------------------------------------------------
# 1-3: payment aggregation
# ---------------------------------------------------------------------------

def test_one_account_two_payments_counted(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Иванов Иван"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY)
    account = _make_account(db, student)
    _make_payment(db, account, 5000)
    _make_payment(db, account, 5000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.payment_count == 2
        assert entry.payment_total == 10000
    finally:
        _cleanup(db, [student], abonements=[ab])


def test_two_accounts_payments_summed(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Петров Петр"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY)
    account1 = _make_account(db, student, name="Основной")
    account2 = _make_account(db, student, name="Доп")
    _make_payment(db, account1, 3000)
    _make_payment(db, account2, 3000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.payment_count == 2
        assert entry.payment_total == 6000
    finally:
        _cleanup(db, [student], abonements=[ab])


def test_lesson_deduction_not_counted_as_payment(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Сидоров Сидор"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY)
    account = _make_account(db, student)
    _make_payment(db, account, 5000)
    _make_deduction(db, account)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.payment_count == 1
    finally:
        _cleanup(db, [student], abonements=[ab])


# ---------------------------------------------------------------------------
# 4-7: group / individual lesson counting
# ---------------------------------------------------------------------------

def test_group_six_lessons_remaining_two(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Кузнецов Кузьма"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=10))
    _enroll(db, group, student)
    for i in range(6):
        _make_lesson(db, group, student, TODAY - timedelta(days=5 - i))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 6
        assert entry.lessons_remaining == 2
        assert "period_overflow" not in entry.warnings
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


def test_group_eight_lessons_remaining_zero_no_warning(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Васильев Вася"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=10))
    _enroll(db, group, student)
    for i in range(8):
        _make_lesson(db, group, student, TODAY - timedelta(days=9 - i))
    account = _make_account(db, student)
    _make_payment(db, account, 10000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 8
        assert entry.lessons_remaining == 0
        assert "period_overflow" not in entry.warnings
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


def test_group_ten_lessons_remaining_zero_with_warning(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Николаев Коля"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=15))
    _enroll(db, group, student)
    for i in range(10):
        _make_lesson(db, group, student, TODAY - timedelta(days=14 - i))
    account = _make_account(db, student)
    _make_payment(db, account, 10000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 10
        assert entry.lessons_remaining == 0
        assert "period_overflow" in entry.warnings
        assert entry.period_should_rollover is True
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


def test_individual_ten_lessons_remaining_is_none(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db, abonement_format="individual", lessons_count=None)
    group = _make_group(db, trainer, lesson_format="individual")
    student = _make_student(db, _uniq("Орлов Олег"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=20))
    _enroll(db, group, student)
    for i in range(10):
        _make_lesson(db, group, student, TODAY - timedelta(days=19 - i))
    account = _make_account(db, student)
    _make_payment(db, account, 5000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.learning_format == "individual"
        assert entry.lessons_remaining is None
        assert entry.lifetime_lessons_passed == 10
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# 8: grant exclusion
# ---------------------------------------------------------------------------

def test_grant_student_excluded_from_without_payments_bucket(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Грантовик Гриша"), abonement=ab, on_grant=True)
    _make_card(db, student, learning_period_start=TODAY)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.on_grant is True
        without_payment_ids = {e.student_id for e in result.students if not e.on_grant and e.payment_count == 0}
        assert student.id not in without_payment_ids
        assert "no_payment_but_lessons" not in entry.warnings
    finally:
        _cleanup(db, [student], abonements=[ab])


# ---------------------------------------------------------------------------
# 9: missing period_start
# ---------------------------------------------------------------------------

def test_group_without_period_start_gets_warning(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Без Периода"), abonement=ab)
    _make_card(db, student, learning_period_start=None)
    _enroll(db, group, student)
    _make_lesson(db, group, student, TODAY - timedelta(days=1))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.period_state == "missing"
        assert "missing_period_start" in entry.warnings
        assert entry.lessons_passed is None
        assert entry.lifetime_lessons_count == 1
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# 10-11: payment/lessons mismatch warnings
# ---------------------------------------------------------------------------

def test_payment_but_no_lessons_warning(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Предоплата Петя"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY)
    account = _make_account(db, student)
    _make_payment(db, account, 5000)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert "payment_without_lessons" in entry.warnings
    finally:
        _cleanup(db, [student], abonements=[ab])


def test_lessons_but_no_payment_warning(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Должник Денис"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=5))
    _enroll(db, group, student)
    _make_lesson(db, group, student, TODAY - timedelta(days=1))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert "no_payment_but_lessons" in entry.warnings
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# 12-13: duplicate students not merged
# ---------------------------------------------------------------------------

def test_two_students_same_name_stay_separate(db):
    from app.services.student_payment_audit import build_student_payment_audit

    ab = _make_abonement(db)
    name = _uniq("Одинаков Олег")
    s1 = _make_student(db, name, abonement=ab)
    s2 = _make_student(db, name, abonement=ab)
    _make_card(db, s1, learning_period_start=TODAY)
    _make_card(db, s2, learning_period_start=TODAY)
    try:
        result = build_student_payment_audit(db, today=TODAY)
        e1 = _entry_for(result, s1.id)
        e2 = _entry_for(result, s2.id)
        assert e1.possible_duplicate is True
        assert e2.possible_duplicate is True
        assert e2.student_id in e1.duplicate_student_ids
        assert e1.student_id in e2.duplicate_student_ids
        assert e1.student_id != e2.student_id
    finally:
        _cleanup(db, [s1, s2], abonements=[ab])


def test_danilova_daria_multiple_matches_not_merged(db, monkeypatch):
    import app.services.student_payment_audit as audit_module

    test_name = f"тест дубль {uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(audit_module, "DANILOVA_DARIA_NAME", test_name)

    ab = _make_abonement(db)
    s1 = _make_student(db, test_name.title(), abonement=ab)
    s2 = _make_student(db, f"  {test_name.upper()}  ", abonement=ab)  # разный регистр/пробелы
    # в реальных данных ФИО обычно содержит отчество — матчинг должен его не требовать
    s3 = _make_student(db, f"{test_name.title()} Сергеевна", abonement=ab)
    s4 = _make_student(db, _uniq("Иванов Иван"), abonement=ab)  # не должен попасть в выборку
    _make_card(db, s1, learning_period_start=TODAY)
    _make_card(db, s2, learning_period_start=TODAY)
    _make_card(db, s3, learning_period_start=TODAY)
    _make_card(db, s4, learning_period_start=TODAY)
    try:
        matches = audit_module.build_danilova_daria_report(db, today=TODAY)
        ids = {e.student_id for e in matches}
        assert ids == {s1.id, s2.id, s3.id}
        assert all(e.possible_duplicate for e in matches)
    finally:
        _cleanup(db, [s1, s2, s3, s4], abonements=[ab])


def test_danilova_duplicate_split_lessons_vs_payments(db, monkeypatch):
    """item 11: один id — только занятия, другой — только оплаты."""
    import app.services.student_payment_audit as audit_module

    test_name = f"тест дубль {uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(audit_module, "DANILOVA_DARIA_NAME", test_name)

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    s_lessons = _make_student(db, test_name, abonement=ab)
    s_payments = _make_student(db, test_name, abonement=ab)
    _make_card(db, s_lessons, learning_period_start=TODAY - timedelta(days=5))
    _make_card(db, s_payments, learning_period_start=TODAY - timedelta(days=5))
    _enroll(db, group, s_lessons)
    _make_lesson(db, group, s_lessons, TODAY - timedelta(days=1))
    account = _make_account(db, s_payments)
    _make_payment(db, account, 5000)
    try:
        matches = audit_module.build_danilova_daria_report(db, today=TODAY)
        by_id = {e.student_id: e for e in matches}
        assert by_id[s_lessons.id].payment_count == 0
        assert by_id[s_lessons.id].lessons_passed == 1
        assert by_id[s_payments.id].payment_count == 1
        assert by_id[s_payments.id].lessons_passed == 0
        assert all(e.possible_duplicate for e in matches)
    finally:
        _cleanup(db, [s_lessons, s_payments], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# 14-16: freeze / future / missed-lesson handling (delegated to student_card_period,
# sanity-checked here end-to-end)
# ---------------------------------------------------------------------------

def test_frozen_lesson_excluded_from_current_period(db):
    from app.models import StudentFreeze
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Заморозка Зоя"), abonement=ab)
    period_start = TODAY - timedelta(days=10)
    _make_card(db, student, learning_period_start=period_start)
    _enroll(db, group, student)
    frozen_date = TODAY - timedelta(days=5)
    db.add(StudentFreeze(student_id=student.id, freeze_start=frozen_date, freeze_end=frozen_date))
    db.commit()
    _make_lesson(db, group, student, frozen_date)
    _make_lesson(db, group, student, TODAY - timedelta(days=1))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 1
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


def test_future_lesson_not_counted(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Будущев Борис"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=5))
    _enroll(db, group, student)
    _make_lesson(db, group, student, TODAY - timedelta(days=1))
    _make_lesson(db, group, student, TODAY + timedelta(days=3))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 1
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


def test_missed_group_lesson_counts_toward_eight(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db)
    group = _make_group(db, trainer)
    student = _make_student(db, _uniq("Пропускин Паша"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=5))
    _enroll(db, group, student)
    _make_lesson(db, group, student, TODAY - timedelta(days=3), attended=False, absence_reason="sick")
    _make_lesson(db, group, student, TODAY - timedelta(days=1))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lessons_passed == 2
        assert entry.lessons_attended == 1
        assert entry.lessons_missed == 1
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# 17: individual lifetime count across multiple periods
# ---------------------------------------------------------------------------

def test_individual_lifetime_count_across_periods(db):
    from app.services.student_payment_audit import build_student_payment_audit

    trainer = _make_trainer(db)
    ab = _make_abonement(db, abonement_format="individual", lessons_count=None)
    group = _make_group(db, trainer, lesson_format="individual")
    student = _make_student(db, _uniq("Долгоиграющий Леонид"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY - timedelta(days=2))
    _enroll(db, group, student)
    for i in range(5):
        _make_lesson(db, group, student, TODAY - timedelta(days=40 - i))
    for i in range(3):
        _make_lesson(db, group, student, TODAY - timedelta(days=i))
    try:
        result = build_student_payment_audit(db, today=TODAY)
        entry = _entry_for(result, student.id)
        assert entry.lifetime_lessons_passed == 8
        assert entry.current_period_lessons == 3
    finally:
        _cleanup(db, [student], groups=[group], abonements=[ab])


# ---------------------------------------------------------------------------
# duplicate payments (finance_transaction_id)
# ---------------------------------------------------------------------------

def test_duplicate_payments_detected_by_finance_transaction_id(db):
    from app.models import FinanceTransaction, FinanceTransactionDirection
    from app.services.student_payment_audit import detect_possible_duplicate_payments

    ab = _make_abonement(db)
    student = _make_student(db, _uniq("Банковский Боря"), abonement=ab)
    _make_card(db, student, learning_period_start=TODAY)
    account = _make_account(db, student)

    ft_shared = FinanceTransaction(amount=3000, direction=FinanceTransactionDirection.INCOME)
    ft_other = FinanceTransaction(amount=1000, direction=FinanceTransactionDirection.INCOME)
    db.add_all([ft_shared, ft_other])
    db.commit()
    db.refresh(ft_shared)
    db.refresh(ft_other)

    _make_payment(db, account, 3000, finance_transaction_id=ft_shared.id)
    _make_payment(db, account, 3000, finance_transaction_id=ft_shared.id)
    _make_payment(db, account, 1000, finance_transaction_id=ft_other.id)
    try:
        groups = detect_possible_duplicate_payments(db)
        matching = [g for g in groups if g.finance_transaction_id == ft_shared.id]
        assert len(matching) == 1
        assert len(matching[0].transactions) == 2
        assert not any(g.finance_transaction_id == ft_other.id for g in groups)
    finally:
        _cleanup(db, [student], abonements=[ab])
        db.query(FinanceTransaction).filter(FinanceTransaction.id.in_([ft_shared.id, ft_other.id])).delete(
            synchronize_session=False
        )
        db.commit()
