from datetime import date, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from app.models import FinanceArticle
from app.routers import finance as finance_router
from app.routers import sales_makeups as sales_makeups_router
from app.routers import sales as sales_router
from app.routers import sales_tax as sales_tax_router


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


class FakeFinanceDB:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self.refreshed = []

    def add(self, obj) -> None:
        self.added.append(obj)

    def commit(self) -> None:
        self.committed = True

    def refresh(self, obj) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = 1
        self.refreshed.append(obj)


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.result


class FakeSalesDB:
    def __init__(self, student, group) -> None:
        self.student = student
        self.group = group
        self.committed = False
        self.refreshed = []

    def query(self, model):
        if model is sales_router.Student:
            return FakeQuery(self.student)
        if model is sales_router.Group:
            return FakeQuery(self.group)
        raise AssertionError(f"Unexpected model query: {model}")

    def commit(self) -> None:
        self.committed = True

    def refresh(self, obj) -> None:
        self.refreshed.append(obj)


def test_finance_create_article_returns_article(client: TestClient, monkeypatch) -> None:
    fake_db = FakeFinanceDB()
    fake_user = SimpleNamespace(id=1, role="owner")

    app.dependency_overrides[finance_router.get_db] = lambda: fake_db
    app.dependency_overrides[auth.get_current_active_user] = lambda: fake_user
    monkeypatch.setattr(finance_router.auth, "has_permission", lambda user, permission: permission == "finance.access")

    response = client.post(
        "/api/finance/articles",
        json={
            "name": "Office Rent",
            "direction": "expense",
            "scope": "academy",
            "cost_kind": "fixed",
        },
    )

    assert response.status_code == 200
    assert fake_db.committed is True
    assert len(fake_db.added) == 1
    article = fake_db.added[0]
    assert isinstance(article, FinanceArticle)

    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Office Rent"
    assert data["direction"] == "expense"
    assert data["scope"] == "academy"
    assert data["cost_kind"] == "fixed"
    assert data["is_active"] is True


def test_finance_create_article_rejects_invalid_direction(client: TestClient, monkeypatch) -> None:
    fake_db = FakeFinanceDB()
    fake_user = SimpleNamespace(id=1, role="owner")

    app.dependency_overrides[finance_router.get_db] = lambda: fake_db
    app.dependency_overrides[auth.get_current_active_user] = lambda: fake_user
    monkeypatch.setattr(finance_router.auth, "has_permission", lambda user, permission: permission == "finance.access")

    response = client.post(
        "/api/finance/articles",
        json={
            "name": "Office Rent",
            "direction": "broken",
            "scope": "academy",
            "cost_kind": "fixed",
        },
    )

    assert response.status_code == 400
    assert fake_db.committed is False


def test_sales_public_makeup_selection_returns_slots(client: TestClient, monkeypatch) -> None:
    absence = SimpleNamespace(id=7, student_id=11, group_id=15, lesson_date=date(2026, 5, 20))
    student = SimpleNamespace(id=11)
    group = SimpleNamespace(id=15, name="Group A")
    fake_db = FakeSalesDB(student=student, group=group)

    app.dependency_overrides[sales_makeups_router.get_db] = lambda: fake_db
    monkeypatch.setattr(sales_makeups_router, "resolve_absence_by_token", lambda db, token: absence)
    monkeypatch.setattr(sales_makeups_router, "get_student_display_name", lambda db, student_obj: "Иван Петров")
    monkeypatch.setattr(
        sales_makeups_router,
        "list_makeup_suggestions_for_absence",
        lambda db, absence_obj: [
            {
                "group_id": 21,
                "group_name": "Makeup Group",
                "program_name": "Math",
                "lesson_date": date(2026, 5, 22),
                "day_of_week": 4,
                "start_time": "16:00",
            }
        ],
    )

    response = client.get("/api/sales/public/makeup-selection", params={"token": "token-123"})

    assert response.status_code == 200
    data = response.json()
    assert data["absence_id"] == 7
    assert data["student_id"] == 11
    assert data["student_name"] == "Иван Петров"
    assert data["original_group_name"] == "Group A"
    assert len(data["available_slots"]) == 1
    assert data["available_slots"][0]["group_id"] == 21


def test_sales_public_makeup_selection_confirm_commits_and_returns_response(client: TestClient, monkeypatch) -> None:
    absence = SimpleNamespace(
        id=7,
        lesson_attendance_id=99,
        student_id=11,
        group_id=15,
        lesson_date=date(2026, 5, 20),
        stage="assigned",
        absence_reason=None,
        absence_comment=None,
        makeup_group_id=21,
        makeup_lesson_date=date(2026, 5, 22),
        makeup_custom_lesson_id=None,
        created_at=datetime(2026, 5, 20, 10, 0, 0),
        updated_at=datetime(2026, 5, 21, 10, 0, 0),
    )
    fake_db = FakeSalesDB(student=None, group=SimpleNamespace(id=21, name="Makeup Group"))
    calls = {"task_created": False, "link_closed": False}

    app.dependency_overrides[sales_makeups_router.get_db] = lambda: fake_db
    monkeypatch.setattr(sales_makeups_router, "resolve_absence_by_token", lambda db, token: absence)
    monkeypatch.setattr(
        sales_makeups_router,
        "absence_makeup_assign",
        lambda db, absence_id, makeup_group_id, makeup_lesson_date: SimpleNamespace(absence=absence),
    )
    monkeypatch.setattr(sales_makeups_router, "log_student_activity", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        sales_makeups_router,
        "create_sales_confirmation_task",
        lambda *args, **kwargs: calls.__setitem__("task_created", True),
    )
    monkeypatch.setattr(
        sales_makeups_router,
        "close_send_link_tasks_for_absence",
        lambda *args, **kwargs: calls.__setitem__("link_closed", True),
    )
    monkeypatch.setattr(
        sales_makeups_router,
        "_absence_to_response",
        lambda db, absence_obj: {
            "id": absence_obj.id,
            "lesson_attendance_id": absence_obj.lesson_attendance_id,
            "student_id": absence_obj.student_id,
            "group_id": absence_obj.group_id,
            "lesson_date": absence_obj.lesson_date,
            "stage": absence_obj.stage,
            "absence_reason": absence_obj.absence_reason,
            "absence_comment": absence_obj.absence_comment,
            "makeup_group_id": absence_obj.makeup_group_id,
            "makeup_lesson_date": absence_obj.makeup_lesson_date,
            "makeup_custom_lesson_id": absence_obj.makeup_custom_lesson_id,
            "created_at": absence_obj.created_at,
            "updated_at": absence_obj.updated_at,
            "student_name": "Иван Петров",
            "group_name": "Group A",
            "program_name": None,
            "makeup_group_name": "Makeup Group",
            "makeup_custom_lesson_title": None,
        },
    )

    response = client.post(
        "/api/sales/public/makeup-selection/confirm",
        json={
            "token": "token-123",
            "makeup_group_id": 21,
            "makeup_lesson_date": "2026-05-22",
        },
    )

    assert response.status_code == 200
    assert fake_db.committed is True
    assert calls["task_created"] is True
    assert calls["link_closed"] is True
    assert response.json()["makeup_group_id"] == 21


def test_sales_tax_status_returns_template_flags(client: TestClient, monkeypatch) -> None:
    fake_user = SimpleNamespace(id=1, role="owner")
    app.dependency_overrides[sales_tax_router.require_sales_admin_owner] = lambda: fake_user
    monkeypatch.setattr(sales_tax_router, "knd_template_path", lambda: "D:/tmp/knd_1151158.pdf")
    monkeypatch.setattr(sales_tax_router, "PYPDF_AVAILABLE", True)
    monkeypatch.setattr(sales_tax_router.os.path, "isfile", lambda path: path == "D:/tmp/knd_1151158.pdf")

    response = client.get("/api/sales/tax-deduction-certificate/status")

    assert response.status_code == 200
    assert response.json() == {
        "template_path": "D:/tmp/knd_1151158.pdf",
        "template_exists": True,
        "pypdf_available": True,
        "will_use_template": True,
    }


def test_sales_tax_generate_pdf_uses_fallback_builder(client: TestClient, monkeypatch) -> None:
    fake_user = SimpleNamespace(id=1, role="owner")
    app.dependency_overrides[sales_tax_router.require_sales_admin_owner] = lambda: fake_user

    calls = {"fallback": False}
    monkeypatch.setattr(sales_tax_router, "REPORTLAB_AVAILABLE", True)
    monkeypatch.setattr(sales_tax_router, "PYPDF_AVAILABLE", False)
    monkeypatch.setattr(sales_tax_router, "knd_template_path", lambda: "D:/tmp/knd_1151158.pdf")
    monkeypatch.setattr(
        sales_tax_router,
        "build_tax_deduction_pdf_knd",
        lambda body: calls.__setitem__("fallback", True) or b"%PDF-test",
    )

    response = client.post("/api/sales/tax-deduction-certificate", json={"cert_number": "123"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-spravka-source"] == "generated"
    assert calls["fallback"] is True
    assert response.content == b"%PDF-test"
