"""
Интеграционные тесты «Динамика Академии по месяцам» (owner dashboard).

Работают против реальной БД, заданной DATABASE_URL (как остальные integration-тесты
в этом пакете), и вызывают build_academy_monthly_metrics()/rebuild_academy_monthly_snapshot()
напрямую (без HTTP), создавая свои строки с уникальными uuid-суффиксами и удаляя их
в конце каждого теста.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from tests.integration.conftest import _is_db_configured

pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")


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


@pytest.fixture
def owner_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_owner_monthly_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    # Удаление пользователя сопутствующими FK не производится (как и в других
    # integration-тестах пакета) — дев-БД одноразовая, uuid исключает конфликт.


@pytest.fixture
def abonements(db):
    from app.models import Abonement

    individual = Abonement(name=f"Individual {uuid.uuid4().hex[:6]}", price=10000.0, abonement_format="individual")
    group = Abonement(name=f"Group {uuid.uuid4().hex[:6]}", price=6000.0, abonement_format="group")
    db.add_all([individual, group])
    db.commit()
    db.refresh(individual)
    db.refresh(group)
    yield {"individual": individual, "group": group}
    db.delete(individual)
    db.delete(group)
    db.commit()


def _make_lead(db, owner_user, *, created_at=None, status=None, won_at=None):
    from app.models import Lead, LeadStatus

    lead = Lead(
        owner_id=owner_user.id,
        contact_name=f"Lead {uuid.uuid4().hex[:8]}",
        phone="+70000000000",
        status=status or LeadStatus.NEW,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    if created_at is not None:
        db.query(Lead).filter(Lead.id == lead.id).update({"created_at": created_at})
        db.commit()
    if won_at is not None:
        lead.won_at = won_at
        db.commit()
    db.refresh(lead)
    return lead


def _make_student(db, abonement=None, *, status=None):
    from app.models import Student, StudentStatus

    student = Student(
        full_name=f"Student {uuid.uuid4().hex[:8]}",
        status=status or StudentStatus.ACTIVE,
        abonement_id=abonement.id if abonement else None,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_account(db, student):
    from app.models import StudentAccount

    account = StudentAccount(student_id=student.id, name="Основной", balance=0.0)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _make_payment(db, account, amount, created_at, payment_format=None):
    from app.models import StudentAccountTransaction, StudentAccountTransactionKind

    tx = StudentAccountTransaction(
        account_id=account.id,
        amount=amount,
        kind=StudentAccountTransactionKind.PAYMENT,
        payment_format=payment_format,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    db.query(StudentAccountTransaction).filter(StudentAccountTransaction.id == tx.id).update(
        {"created_at": created_at}
    )
    db.commit()
    db.refresh(tx)
    return tx


def _dt(y, m, d, h=0, mi=0, s=0):
    return datetime(y, m, d, h, mi, s, tzinfo=timezone.utc)


def _row_for(rows, month: str):
    return next(r for r in rows if r["month"] == month)


class TestLeadsAndConversion:
    def test_leads_split_across_month_boundary(self, db, owner_user):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        lead_sep = _make_lead(db, owner_user, created_at=_dt(2026, 9, 30, 23, 59, 59))
        lead_oct = _make_lead(db, owner_user, created_at=_dt(2026, 10, 1, 0, 0, 0))
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 10, 1))
            assert _row_for(rows, "2026-09")["leads_created"] == 1
            assert _row_for(rows, "2026-10")["leads_created"] == 1
        finally:
            for lead in (lead_sep, lead_oct):
                db.delete(lead)
            db.commit()

    def test_won_at_not_moved_by_later_update(self, db, owner_user):
        """Лид выиграл в сентябре; поле обновляется в октябре (как update_lead делает с
        updated_at), но won_at должен остаться сентябрьским."""
        from app.models import Lead, LeadStatus
        from app.services.owner_dashboard import build_academy_monthly_metrics

        lead = _make_lead(db, owner_user, status=LeadStatus.WON, won_at=_dt(2026, 9, 15))
        db.query(Lead).filter(Lead.id == lead.id).update({"updated_at": _dt(2026, 10, 5)})
        db.commit()
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 10, 1))
            assert _row_for(rows, "2026-09")["won_leads"] == 1
            assert _row_for(rows, "2026-10")["won_leads"] == 0
        finally:
            db.delete(lead)
            db.commit()

    def test_conversion_pct_one_decimal(self, db, owner_user):
        from app.services.owner_dashboard import build_academy_monthly_metrics
        from app.models import LeadStatus

        leads = [_make_lead(db, owner_user, created_at=_dt(2026, 9, 10)) for _ in range(3)]
        won = _make_lead(db, owner_user, created_at=_dt(2026, 9, 10), status=LeadStatus.WON, won_at=_dt(2026, 9, 12))
        leads.append(won)
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            row = _row_for(rows, "2026-09")
            assert row["leads_created"] == 4
            assert row["won_leads"] == 1
            assert row["lead_conversion_pct"] == 25.0
        finally:
            for lead in leads:
                db.delete(lead)
            db.commit()

    def test_empty_month_returns_zero_row(self, db):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        rows = build_academy_monthly_metrics(db, date_from=date(2019, 1, 1), date_to=date(2019, 1, 1))
        assert len(rows) == 1
        row = rows[0]
        assert row["month"] == "2019-01"
        assert row["leads_created"] == 0
        assert row["won_leads"] == 0
        assert row["lead_conversion_pct"] == 0.0
        assert row["payments_total"] == 0.0
        assert row["active_students"] == 0

    def test_cross_year_range(self, db, owner_user):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        lead_dec = _make_lead(db, owner_user, created_at=_dt(2026, 12, 15))
        lead_jan = _make_lead(db, owner_user, created_at=_dt(2027, 1, 5))
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 12, 1), date_to=date(2027, 1, 1))
            assert [r["month"] for r in rows] == ["2026-12", "2027-01"]
            assert _row_for(rows, "2026-12")["leads_created"] == 1
            assert _row_for(rows, "2027-01")["leads_created"] == 1
        finally:
            for lead in (lead_dec, lead_jan):
                db.delete(lead)
            db.commit()


class TestPayments:
    def test_payment_at_month_end_boundary(self, db, abonements):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        student = _make_student(db, abonements["group"])
        account = _make_account(db, student)
        tx_end_of_sep = _make_payment(db, account, 1000.0, _dt(2026, 9, 30, 23, 59, 59), payment_format="group")
        tx_start_of_oct = _make_payment(db, account, 2000.0, _dt(2026, 10, 1, 0, 0, 0), payment_format="group")
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 10, 1))
            assert _row_for(rows, "2026-09")["payments_total"] == 1000.0
            assert _row_for(rows, "2026-10")["payments_total"] == 2000.0
        finally:
            for tx in (tx_end_of_sep, tx_start_of_oct):
                db.delete(tx)
            db.delete(account)
            db.delete(student)
            db.commit()

    def test_two_payments_same_student_one_paying_student(self, db, abonements):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        student = _make_student(db, abonements["individual"])
        account = _make_account(db, student)
        tx1 = _make_payment(db, account, 3000.0, _dt(2026, 9, 5), payment_format="individual")
        tx2 = _make_payment(db, account, 3000.0, _dt(2026, 9, 20), payment_format="individual")
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            row = _row_for(rows, "2026-09")
            assert row["paying_students"] == 1
            assert row["payment_transactions"] == 2
            assert row["payments_total"] == 6000.0
            assert row["average_check"] == 6000.0
        finally:
            for tx in (tx1, tx2):
                db.delete(tx)
            db.delete(account)
            db.delete(student)
            db.commit()

    def test_group_individual_split_uses_snapshot(self, db, abonements):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        s_individual = _make_student(db, abonements["individual"])
        s_group = _make_student(db, abonements["group"])
        a_individual = _make_account(db, s_individual)
        a_group = _make_account(db, s_group)
        tx_individual = _make_payment(db, a_individual, 5000.0, _dt(2026, 9, 10), payment_format="individual")
        tx_group = _make_payment(db, a_group, 4000.0, _dt(2026, 9, 10), payment_format="group")
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            row = _row_for(rows, "2026-09")
            assert row["payments_individual"] == 5000.0
            assert row["payments_group"] == 4000.0
            assert row["payments_total"] == 9000.0
        finally:
            for tx in (tx_individual, tx_group):
                db.delete(tx)
            for acc in (a_individual, a_group):
                db.delete(acc)
            for st in (s_individual, s_group):
                db.delete(st)
            db.commit()

    def test_historical_payment_format_unaffected_by_later_abonement_change(self, db, abonements):
        """Регрессия на основную проблему: платёж в сентябре как individual, в октябре
        ученику меняют абонемент на group — сентябрьская категория не должна поменяться."""
        from app.services.owner_dashboard import build_academy_monthly_metrics

        student = _make_student(db, abonements["individual"])
        account = _make_account(db, student)
        tx = _make_payment(db, account, 7000.0, _dt(2026, 9, 10), payment_format="individual")
        try:
            rows_before = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            assert _row_for(rows_before, "2026-09")["payments_individual"] == 7000.0

            student.abonement_id = abonements["group"].id
            db.commit()

            rows_after = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            row_after = _row_for(rows_after, "2026-09")
            assert row_after["payments_individual"] == 7000.0
            assert row_after["payments_group"] == 0.0
        finally:
            db.delete(tx)
            db.delete(account)
            db.delete(student)
            db.commit()

    def test_legacy_null_format_falls_back_to_current_abonement(self, db, abonements):
        from app.services.owner_dashboard import build_academy_monthly_metrics

        student = _make_student(db, abonements["group"])
        account = _make_account(db, student)
        tx = _make_payment(db, account, 1500.0, _dt(2026, 9, 10), payment_format=None)
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 9, 1))
            row = _row_for(rows, "2026-09")
            assert row["payments_group"] == 1500.0
            assert row["payments_individual"] == 0.0
        finally:
            db.delete(tx)
            db.delete(account)
            db.delete(student)
            db.commit()


class TestActiveStudents:
    """Используем delta-подход (count до/после создания тестового студента), а не
    абсолютные числа — dev-БД может содержать посторонние строки (seed-данные,
    другие тесты пакета, которые намеренно не чистят за собой, см. их докстринги)."""

    def test_archived_next_month_remains_active_in_previous_month(self, db, abonements):
        from app.models import Student, StudentStatus
        from app.services.owner_dashboard import build_academy_monthly_metrics

        baseline = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 10, 1))
        base_sep = _row_for(baseline, "2026-09")["active_students"]
        base_oct = _row_for(baseline, "2026-10")["active_students"]

        student = _make_student(db, abonements["group"])
        db.query(Student).filter(Student.id == student.id).update({"created_at": _dt(2026, 8, 1)})
        db.commit()
        # Архивация случилась в октябре — в сентябре студент ещё активен
        student.status = StudentStatus.ARCHIVED
        student.archived_at = _dt(2026, 10, 5)
        db.commit()
        try:
            rows = build_academy_monthly_metrics(db, date_from=date(2026, 9, 1), date_to=date(2026, 10, 1))
            assert _row_for(rows, "2026-09")["active_students"] == base_sep + 1
            assert _row_for(rows, "2026-10")["active_students"] == base_oct
        finally:
            db.delete(student)
            db.commit()

    def test_reactivated_student_history(self, db, abonements):
        """Архивирован в сентябре, реактивирован в ноябре: октябрь должен быть "не активен",
        август (до архивации) и ноябрь+ — "активен"."""
        from app.models import Student, StudentStatus
        from app.services.owner_dashboard import _active_students_asof_count

        as_of_aug = datetime(2026, 9, 1, tzinfo=timezone.utc)  # конец августа
        as_of_sep = datetime(2026, 10, 1, tzinfo=timezone.utc)  # конец сентября (уже архивирован)
        as_of_nov = datetime(2026, 12, 1, tzinfo=timezone.utc)  # конец ноября (снова активен)

        base_aug = _active_students_asof_count(db, as_of_aug)
        base_sep = _active_students_asof_count(db, as_of_sep)
        base_nov = _active_students_asof_count(db, as_of_nov)

        student = _make_student(db, abonements["group"])
        db.query(Student).filter(Student.id == student.id).update({"created_at": _dt(2026, 1, 1)})
        student.status = StudentStatus.ACTIVE
        student.archived_at = _dt(2026, 9, 5)
        student.activated_at = _dt(2026, 11, 5)
        db.commit()
        try:
            assert _active_students_asof_count(db, as_of_aug) == base_aug + 1  # до архивации — активен
            assert _active_students_asof_count(db, as_of_sep) == base_sep  # в "провале" — не активен
            assert _active_students_asof_count(db, as_of_nov) == base_nov + 1  # после реактивации — активен
        finally:
            db.delete(student)
            db.commit()


def test_rebuild_snapshot_idempotent(db, abonements):
    from app.models import AcademyMonthlySnapshot
    from app.services.owner_dashboard import rebuild_academy_monthly_snapshot

    student = _make_student(db, abonements["group"])
    account = _make_account(db, student)
    tx = _make_payment(db, account, 2500.0, _dt(2026, 7, 10), payment_format="group")
    try:
        snap1 = rebuild_academy_monthly_snapshot(db, date(2026, 7, 1))
        db.commit()
        assert snap1.payments_total == 2500.0

        snap2 = rebuild_academy_monthly_snapshot(db, date(2026, 7, 1))
        db.commit()
        assert snap2.id == snap1.id
        assert snap2.payments_total == 2500.0

        count = db.query(AcademyMonthlySnapshot).filter(AcademyMonthlySnapshot.month == date(2026, 7, 1)).count()
        assert count == 1
    finally:
        db.query(AcademyMonthlySnapshot).filter(AcademyMonthlySnapshot.month == date(2026, 7, 1)).delete()
        db.delete(tx)
        db.delete(account)
        db.delete(student)
        db.commit()
