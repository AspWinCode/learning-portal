"""
LEGO: интеграционные тесты на реальной PostgreSQL (DATABASE_URL).

Проверяют то, что мок-тесты не покрывают: уникальность посещаемости, пересчёт статусов,
идемпотентность оплат, финансовую проводку в target `leninets`, scope тренера и изоляцию от Академии.
Все созданные строки помечены префиксом TEST-LEGO и удаляются после прогона.
"""
import os
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models import (  # noqa: E402  (импорт после проверки окружения ниже)
    FinanceTarget,
    FinanceTransaction,
    LegoEvent,
    LegoGroup,
    LegoGroupStudent,
    LegoLesson,
    LegoPayment,
    LegoStudent,
    User,
    UserRole,
)

_url = (os.getenv("DATABASE_URL") or "").strip()
pytestmark = pytest.mark.requires_db
if not _url or "user:password" in _url or "YOUR_PASSWORD" in _url:
    pytest.skip("LEGO DB tests require a configured DATABASE_URL", allow_module_level=True)

from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role  # noqa: E402

TAG = "TEST-LEGO"


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def cleanup(db):
    """Удаляет всё, что создал тест с префиксом TAG, в правильном порядке FK."""
    yield
    db.rollback()
    student_ids = [s.id for s in db.query(LegoStudent).filter(LegoStudent.full_name.like(f"{TAG}%")).all()]
    group_ids = [g.id for g in db.query(LegoGroup).filter(LegoGroup.name.like(f"{TAG}%")).all()]
    user_ids = [u.id for u in db.query(User).filter(User.email.like("test-lego-%")).all()]
    event_ids = [e.id for e in db.query(LegoEvent).filter(LegoEvent.title.like(f"{TAG}%")).all()]
    # Регистрации ссылаются на платежи, поэтому удаляем их первыми.
    if event_ids or student_ids:
        from app.models import LegoEventRegistration

        reg_q = db.query(LegoEventRegistration)
        if event_ids:
            reg_q.filter(LegoEventRegistration.event_id.in_(event_ids)).delete(synchronize_session=False)
        if student_ids:
            reg_q.filter(LegoEventRegistration.student_id.in_(student_ids)).delete(synchronize_session=False)
    if event_ids:
        db.query(LegoPayment).filter(LegoPayment.event_id.in_(event_ids)).delete(synchronize_session=False)
        db.query(LegoEvent).filter(LegoEvent.id.in_(event_ids)).delete(synchronize_session=False)
    if student_ids:
        db.query(LegoPayment).filter(LegoPayment.student_id.in_(student_ids)).delete(synchronize_session=False)
    tx_ids = [t.id for t in db.query(FinanceTransaction.id).filter(FinanceTransaction.description_raw.like(f"LEGO: {TAG}%")).all()]
    if tx_ids:
        db.query(FinanceTransaction).filter(FinanceTransaction.id.in_(tx_ids)).delete(synchronize_session=False)
    if group_ids:
        lesson_ids = [l.id for l in db.query(LegoLesson.id).filter(LegoLesson.group_id.in_(group_ids)).all()]
        if lesson_ids:
            from app.models import LegoAttendance

            db.query(LegoAttendance).filter(LegoAttendance.lesson_id.in_(lesson_ids)).delete(synchronize_session=False)
            db.query(LegoLesson).filter(LegoLesson.id.in_(lesson_ids)).delete(synchronize_session=False)
        db.query(LegoGroupStudent).filter(LegoGroupStudent.lego_group_id.in_(group_ids)).delete(synchronize_session=False)
        db.query(LegoGroup).filter(LegoGroup.id.in_(group_ids)).delete(synchronize_session=False)
    if student_ids:
        db.query(LegoStudent).filter(LegoStudent.id.in_(student_ids)).delete(synchronize_session=False)
    if user_ids:
        from app.models import ActionLog

        db.query(ActionLog).filter(ActionLog.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    # Тестовые филиалы и их targets (код начинается с testlego).
    from app.models import LegoBranch

    db.query(LegoBranch).filter(LegoBranch.code.like("testlego%")).delete(synchronize_session=False)
    db.query(FinanceTarget).filter(FinanceTarget.code.like("testlego%")).delete(synchronize_session=False)
    db.commit()


def _make_user(db, label: str, role: UserRole = UserRole.TRAINER) -> User:
    user = User(
        email=f"test-lego-{label}-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name=f"{TAG} {label}",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _as(user: User, extra_permissions=None):
    """
    Подменяет текущего пользователя транзиентной копией (не в сессии, без записи в БД).
    Права задаются через custom role, как в проекте.
    """
    current = User(
        id=user.id,
        email=user.email,
        hashed_password="x",
        full_name=user.full_name,
        role=user.role,
        is_active=True,
    )
    if extra_permissions is not None:
        current.custom_role = Role(
            key=f"test_lego_{user.id}",
            name="TEST LEGO",
            base_role=UserRole.TRAINER,
            permissions=extra_permissions,
            is_system=False,
            is_active=True,
        )
    app.dependency_overrides[auth.get_current_active_user] = lambda: current
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.pop(auth.get_current_active_user, None)


@pytest.fixture
def owner(db, cleanup):
    return _make_user(db, "owner", UserRole.OWNER)


@pytest.fixture
def trainer(db, cleanup):
    return _make_user(db, "trainer")


@pytest.fixture
def other_trainer(db, cleanup):
    return _make_user(db, "other")


def _group(client, name: str, trainer_id: int) -> int:
    r = client.post("/api/v1/lego/groups", json={"name": f"{TAG} {name}", "trainer_id": trainer_id})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _student(client, name: str) -> int:
    r = client.post("/api/v1/lego/students", json={"full_name": f"{TAG} {name}", "parent_name": "Мама"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _join(client, group_id: int, student_id: int) -> None:
    r = client.post(f"/api/v1/lego/groups/{group_id}/members", json={"student_id": student_id})
    assert r.status_code == 201, r.text


# ── Посещаемость ─────────────────────────────────────────────────────────────

def test_lesson_exists_with_zero_children(db, owner, cleanup) -> None:
    client = _as(owner)
    group_id = _group(client, "пустая", owner.id)
    r = client.post("/api/v1/lego/lessons", json={"group_id": group_id, "lesson_date": date.today().isoformat()})
    assert r.status_code == 201
    assert r.json()["students_count"] == 0
    assert db.query(LegoLesson).filter(LegoLesson.id == r.json()["id"]).first() is not None


def test_roster_and_attendance_then_resave_updates_not_duplicates(db, owner, cleanup) -> None:
    client = _as(owner)
    group_id = _group(client, "посещаемость", owner.id)
    kids = [_student(client, f"ребёнок{i}") for i in range(3)]
    for k in kids:
        _join(client, group_id, k)
    lesson_id = client.post("/api/v1/lego/lessons", json={"group_id": group_id, "lesson_date": date.today().isoformat()}).json()["id"]

    detail = client.get(f"/api/v1/lego/lessons/{lesson_id}").json()
    assert {r["student_id"] for r in detail["roster"]} == set(kids)

    records = [{"student_id": kids[0], "attended": True}, {"student_id": kids[1], "attended": False}, {"student_id": kids[2], "attended": True}]
    assert client.post(f"/api/v1/lego/lessons/{lesson_id}/attendance", json={"records": records}).json()["message"] == "Посещаемость сохранена"

    # Повторное сохранение с другими значениями обновляет строки, а не добавляет новые.
    records[1]["attended"] = True
    client.post(f"/api/v1/lego/lessons/{lesson_id}/attendance", json={"records": records})
    from app.models import LegoAttendance

    rows = db.query(LegoAttendance).filter(LegoAttendance.lesson_id == lesson_id).all()
    assert len(rows) == 3
    assert all(r.attended for r in rows)


def test_child_history_is_correct(owner, cleanup) -> None:
    client = _as(owner)
    group_id = _group(client, "история", owner.id)
    kid = _student(client, "история-ребёнок")
    _join(client, group_id, kid)
    # Ребёнок вступил сегодня, поэтому занятия ставим на сегодня (состав считается по дате вступления).
    for attended in [True, False]:
        lesson_id = client.post(
            "/api/v1/lego/lessons",
            json={"group_id": group_id, "lesson_date": date.today().isoformat()},
        ).json()["id"]
        r = client.post(f"/api/v1/lego/lessons/{lesson_id}/attendance", json={"records": [{"student_id": kid, "attended": attended}]})
        assert r.status_code == 200, r.text
    card = client.get(f"/api/v1/lego/students/{kid}").json()
    assert card["attendance"]["total"] == 2
    assert card["attendance"]["attended"] == 1
    assert card["attendance"]["missed"] == 1


def test_attendance_rejects_child_not_in_group(owner, cleanup) -> None:
    client = _as(owner)
    group_id = _group(client, "чужой-состав", owner.id)
    stranger = _student(client, "не-в-группе")
    lesson_id = client.post("/api/v1/lego/lessons", json={"group_id": group_id, "lesson_date": date.today().isoformat()}).json()["id"]
    r = client.post(f"/api/v1/lego/lessons/{lesson_id}/attendance", json={"records": [{"student_id": stranger, "attended": True}]})
    assert r.status_code == 400


# ── Оплаты и статусы ─────────────────────────────────────────────────────────

def test_payment_lifecycle_unpaid_to_ok_and_history(owner, cleanup) -> None:
    client = _as(owner)
    kid = _student(client, "оплаты")
    assert client.get(f"/api/v1/lego/students/{kid}").json()["payments"]["status"]["status"] == "unpaid"

    today = date.today()
    r = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "payment_date": today.isoformat()})
    assert r.status_code == 201 and r.json()["created"] is True
    card = client.get(f"/api/v1/lego/students/{kid}").json()
    assert card["payments"]["status"]["status"] in {"ok", "due_soon"}
    assert len(card["payments"]["history"]) == 1

    # Вторая оплата продлевает период и не переводит в просрочку.
    client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "payment_date": today.isoformat()})
    card = client.get(f"/api/v1/lego/students/{kid}").json()
    assert len(card["payments"]["history"]) == 2


def test_overdue_child_returns_to_ok_after_payment(db, owner, cleanup) -> None:
    client = _as(owner)
    kid = _student(client, "просрочка")
    student = db.query(LegoStudent).filter(LegoStudent.id == kid).one()
    student.paid_until = date.today() - timedelta(days=12)
    student.next_payment_date = date.today() - timedelta(days=11)
    db.commit()
    assert client.get(f"/api/v1/lego/students/{kid}").json()["payments"]["status"]["status"] == "overdue_10"

    client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000})
    db.expire_all()
    assert client.get(f"/api/v1/lego/students/{kid}").json()["payments"]["status"]["status"] in {"ok", "due_soon"}


def test_repeated_request_with_same_key_books_once(db, owner, cleanup) -> None:
    client = _as(owner)
    kid = _student(client, "идемпотентность")
    key = f"{TAG}-key-{uuid.uuid4().hex}"
    first = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "idempotency_key": key}).json()
    second = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "idempotency_key": key}).json()
    assert first["created"] is True and second["created"] is False
    assert first["id"] == second["id"]
    assert db.query(LegoPayment).filter(LegoPayment.idempotency_key == key).count() == 1
    tx_count = db.query(FinanceTransaction).filter(FinanceTransaction.id == first["finance_transaction_id"]).count()
    assert tx_count == 1


def test_payment_books_income_to_leninets_target(db, owner, cleanup) -> None:
    client = _as(owner)
    kid = _student(client, "финансы")
    r = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 2500, "idempotency_key": f"{TAG}-{uuid.uuid4().hex}"}).json()
    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == r["finance_transaction_id"]).one()
    target = db.query(FinanceTarget).filter(FinanceTarget.id == tx.target_id).one()
    assert target.code == "leninets"
    assert tx.student_id is None
    assert tx.group_id is None
    assert float(tx.amount) == 2500.0

    # Доход виден в общей finance-аналитике по target (тот же фильтр, что в P&L).
    income_sum = (
        db.query(FinanceTransaction.amount)
        .filter(FinanceTransaction.target_id == target.id, FinanceTransaction.id == tx.id)
        .scalar()
    )
    assert income_sum == 2500.0


# ── Права и изоляция ─────────────────────────────────────────────────────────

def test_trainer_sees_only_own_groups(owner, trainer, other_trainer, cleanup) -> None:
    owner_client = _as(owner)
    own = _group(owner_client, "свои", trainer.id)
    foreign = _group(owner_client, "чужие", other_trainer.id)

    trainer_client = _as(trainer, extra_permissions=["lego.access", "lego.attendance"])
    ids = {g["id"] for g in trainer_client.get("/api/v1/lego/groups").json()}
    assert own in ids and foreign not in ids
    assert trainer_client.get(f"/api/v1/lego/groups/{foreign}").status_code in {404, 405}


def test_trainer_cannot_create_lesson_in_foreign_group(owner, trainer, other_trainer, cleanup) -> None:
    foreign = _group(_as(owner), "не-моя", other_trainer.id)
    client = _as(trainer, extra_permissions=["lego.access", "lego.attendance"])
    r = client.post("/api/v1/lego/lessons", json={"group_id": foreign, "lesson_date": date.today().isoformat()})
    assert r.status_code == 403


def test_trainer_cannot_see_foreign_child(owner, trainer, other_trainer, cleanup) -> None:
    owner_client = _as(owner)
    foreign_group = _group(owner_client, "чужой-ребёнок", other_trainer.id)
    kid = _student(owner_client, "чужой")
    _join(owner_client, foreign_group, kid)

    client = _as(trainer, extra_permissions=["lego.access"])
    assert client.get(f"/api/v1/lego/students/{kid}").status_code == 404


def test_trainer_without_payments_permission_gets_403_on_money(owner, trainer, cleanup) -> None:
    kid = _student(_as(owner), "деньги")
    client = _as(trainer, extra_permissions=["lego.access", "lego.attendance"])
    assert client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 1000}).status_code == 403
    assert client.get("/api/v1/lego/payment-summary").status_code == 403


def test_lego_does_not_touch_academy_lesson_tables(db, owner, cleanup) -> None:
    from app.models import LessonAttendance

    before = db.query(LessonAttendance).count()
    client = _as(owner)
    group_id = _group(client, "изоляция", owner.id)
    kid = _student(client, "изоляция-ребёнок")
    _join(client, group_id, kid)
    lesson_id = client.post("/api/v1/lego/lessons", json={"group_id": group_id, "lesson_date": date.today().isoformat()}).json()["id"]
    client.post(f"/api/v1/lego/lessons/{lesson_id}/attendance", json={"records": [{"student_id": kid, "attended": True}]})
    client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "idempotency_key": f"{TAG}-{uuid.uuid4().hex}"})
    db.expire_all()
    assert db.query(LessonAttendance).count() == before


def test_debts_summary_counts_active_children(owner, cleanup) -> None:
    client = _as(owner)
    kid = _student(client, "долги")
    data = client.get("/api/v1/lego/debts?filter=unpaid").json()
    assert any(row["student_id"] == kid for row in data["rows"])
    assert data["summary"]["unpaid"] >= 1


def test_group_detail_lists_members_and_trainer_picker_works(owner, trainer, cleanup) -> None:
    client = _as(owner)
    group_id = _group(client, "состав", trainer.id)
    kid = _student(client, "в-составе")
    _join(client, group_id, kid)
    detail = client.get(f"/api/v1/lego/groups/{group_id}").json()
    assert [m["student_id"] for m in detail["members"]] == [kid]
    assert detail["trainer_id"] == trainer.id

    trainers = client.get("/api/v1/lego/trainers").json()
    assert any(t["id"] == trainer.id for t in trainers)

    r = client.post(f"/api/v1/lego/groups/{group_id}/members/{kid}/leave")
    assert r.status_code == 200
    assert client.get(f"/api/v1/lego/groups/{group_id}").json()["members"] == []


def test_trainer_picker_requires_lego_manage(trainer, cleanup) -> None:
    client = _as(trainer, extra_permissions=["lego.access", "lego.attendance"])
    assert client.get("/api/v1/lego/trainers").status_code == 403


# ── Филиалы и мастер-классы ──────────────────────────────────────────────────

def _default_branch_id(client) -> int:
    branches = client.get("/api/v1/lego/branches").json()
    return next(b["id"] for b in branches if b["code"] == "leninets")


def test_group_default_branch_and_monthly_payment_books_to_branch_target(db, owner, cleanup) -> None:
    client = _as(owner)
    group = client.post("/api/v1/lego/groups", json={"name": f"{TAG} филиал-по-умолчанию"}).json()
    assert group["branch_id"] == _default_branch_id(client)
    kid = _student(client, "филиал-оплата")
    _join(client, group["id"], kid)
    r = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 3000, "idempotency_key": f"{TAG}-{uuid.uuid4().hex}"}).json()
    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == r["finance_transaction_id"]).one()
    assert db.query(FinanceTarget).filter(FinanceTarget.id == tx.target_id).one().code == "leninets"


def test_new_branch_gets_own_target_and_income_goes_there(db, owner, cleanup) -> None:
    client = _as(owner)
    code = f"testlego{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/lego/branches", json={"code": code, "name": "Тестовый филиал"})
    assert r.status_code == 201, r.text
    branch_id = r.json()["id"]
    assert client.post("/api/v1/lego/branches", json={"code": code, "name": "дубль"}).status_code == 409

    group = client.post("/api/v1/lego/groups", json={"name": f"{TAG} второй-филиал", "branch_id": branch_id}).json()
    kid = _student(client, "второй-филиал-ребёнок")
    _join(client, group["id"], kid)
    pay = client.post(f"/api/v1/lego/students/{kid}/payments", json={"amount": 2000, "idempotency_key": f"{TAG}-{uuid.uuid4().hex}"}).json()
    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == pay["finance_transaction_id"]).one()
    assert db.query(FinanceTarget).filter(FinanceTarget.id == tx.target_id).one().code == code


def test_event_capacity_limits_registrations(owner, cleanup) -> None:
    client = _as(owner)
    branch_id = _default_branch_id(client)
    event = client.post(
        "/api/v1/lego/events",
        json={"branch_id": branch_id, "title": f"{TAG} вместимость", "event_date": date.today().isoformat(), "price": 1500, "capacity": 1},
    ).json()
    first = _student(client, "мк-первый")
    second = _student(client, "мк-второй")
    assert client.post(f"/api/v1/lego/events/{event['id']}/registrations", json={"student_id": first}).status_code == 201
    r = client.post(f"/api/v1/lego/events/{event['id']}/registrations", json={"student_id": second})
    assert r.status_code == 409 and r.json()["detail"] == "Мест нет"
    assert client.post(f"/api/v1/lego/events/{event['id']}/registrations", json={"student_id": first}).status_code == 409


def test_one_off_participant_is_not_in_debts_and_event_payment_keeps_monthly_plan(db, owner, cleanup) -> None:
    client = _as(owner)
    branch_id = _default_branch_id(client)
    event = client.post(
        "/api/v1/lego/events",
        json={"branch_id": branch_id, "title": f"{TAG} разовый", "event_date": date.today().isoformat(), "price": 1500},
    ).json()
    reg = client.post(f"/api/v1/lego/events/{event['id']}/registrations", json={"full_name": f"{TAG} разовый-участник", "parent_phone": "+70000000000"})
    assert reg.status_code == 201, reg.text
    participant = reg.json()["student_id"]

    debts = client.get("/api/v1/lego/debts?filter=all").json()["rows"]
    assert all(row["student_id"] != participant for row in debts)

    pay = client.post(f"/api/v1/lego/events/{event['id']}/registrations/{participant}/payment", json={"idempotency_key": f"{TAG}-{uuid.uuid4().hex}"})
    assert pay.status_code == 200, pay.text
    body = pay.json()
    assert body["created"] is True and body["amount"] == 1500.0
    # Повтор с другим ключом не должен создать второй доход за ту же запись.
    again = client.post(f"/api/v1/lego/events/{event['id']}/registrations/{participant}/payment", json={"idempotency_key": f"{TAG}-{uuid.uuid4().hex}"})
    assert again.status_code == 409

    detail = client.get(f"/api/v1/lego/events/{event['id']}").json()
    row = next(p for p in detail["participants"] if p["student_id"] == participant)
    assert row["paid"] is True

    from app.models import LegoStudent as _S

    student = db.query(_S).filter(_S.id == participant).one()
    assert student.paid_until is None and student.next_payment_date is None

    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == body["finance_transaction_id"]).one()
    assert db.query(FinanceTarget).filter(FinanceTarget.id == tx.target_id).one().code == "leninets"


def test_event_attendance_is_recorded(owner, cleanup) -> None:
    client = _as(owner)
    event = client.post(
        "/api/v1/lego/events",
        json={"branch_id": _default_branch_id(client), "title": f"{TAG} посещение", "event_date": date.today().isoformat()},
    ).json()
    kid = _student(client, "мк-посещение")
    client.post(f"/api/v1/lego/events/{event['id']}/registrations", json={"student_id": kid})
    r = client.post(f"/api/v1/lego/events/{event['id']}/registrations/{kid}/attendance?attended=true")
    assert r.status_code == 200
    detail = client.get(f"/api/v1/lego/events/{event['id']}").json()
    assert next(p for p in detail["participants"] if p["student_id"] == kid)["attended"] is True


def test_trainer_cannot_create_branch_or_event(trainer, owner, cleanup) -> None:
    client = _as(trainer, extra_permissions=["lego.access", "lego.attendance"])
    assert client.post("/api/v1/lego/branches", json={"code": "testlego" + uuid.uuid4().hex[:6], "name": "x"}).status_code == 403
    assert client.post("/api/v1/lego/events", json={"branch_id": 1, "title": f"{TAG} x", "event_date": date.today().isoformat()}).status_code == 403

