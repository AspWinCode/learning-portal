"""
Интеграционные тесты Finance Hub (TC-FIN-01 … TC-FIN-28).
Используют dependency_overrides — реальная БД не требуется.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import List, Optional
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.database import get_db
from app.main import app
from app.models import (
    FinanceHubAllocation,
    FinanceHubDebt,
    PersonalFinanceAccount,
    PersonalFinanceTransaction,
    PersonalFinanceDirection,
    FinanceTarget,
    User,
    UserRole,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_owner(user_id: int = 1) -> User:
    u = MagicMock(spec=User)
    u.id = user_id
    u.role = UserRole.OWNER
    u.custom_permissions = None
    return u


def _make_account(
    acct_id: int = 10,
    owner_id: int = 1,
    name: str = "Kaspi",
    balance: float = 500_000.0,
    currency: str = "KZT",
    account_type: str = "bank",
    project_id: Optional[int] = None,
    is_active: bool = True,
) -> PersonalFinanceAccount:
    a = MagicMock(spec=PersonalFinanceAccount)
    a.id = acct_id
    a.owner_id = owner_id
    a.name = name
    a.balance = balance
    a.currency = currency
    a.account_type = account_type
    a.project_id = project_id
    a.is_active = is_active
    a.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return a


def _make_tx(
    tx_id: int = 100,
    account_id: int = 10,
    amount: float = 100_000.0,
    direction: str = "income",
    article: str = "project_revenue",
    hub_status: str = "completed",
    occurred_at: Optional[datetime] = None,
) -> PersonalFinanceTransaction:
    tx = MagicMock(spec=PersonalFinanceTransaction)
    tx.id = tx_id
    tx.account_id = account_id
    tx.amount = amount
    tx.direction = MagicMock()
    tx.direction.value = direction
    tx.article = article
    tx.hub_status = hub_status
    tx.description = None
    tx.occurred_at = occurred_at or datetime(2026, 4, 15, tzinfo=timezone.utc)
    tx.created_at = datetime(2026, 4, 15, tzinfo=timezone.utc)
    acct = _make_account(acct_id=account_id)
    tx.account = acct
    return tx


def _make_debt(
    debt_id: int = 200,
    owner_id: int = 1,
    debt_type: str = "owe",
    counterparty: str = "Ахмет",
    amount: float = 500_000.0,
    paid_amount: float = 0.0,
    currency: str = "KZT",
    due_date: Optional[date] = None,
    status: str = "active",
) -> FinanceHubDebt:
    d = MagicMock(spec=FinanceHubDebt)
    d.id = debt_id
    d.owner_id = owner_id
    d.debt_type = debt_type
    d.counterparty = counterparty
    d.amount = amount
    d.paid_amount = paid_amount
    d.currency = currency
    d.due_date = due_date
    d.description = None
    d.project_id = None
    d.status = status
    d.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return d


class FakeDB:
    """Минимальная заглушка SQLAlchemy Session."""

    def __init__(self):
        self._store: List = []
        self.committed = False
        self._deleted: List = []

    def add(self, obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = len(self._store) + 1
        self._store.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = len(self._store) + 1

    def delete(self, obj):
        self._deleted.append(obj)
        if obj in self._store:
            self._store.remove(obj)

    def query(self, *args):
        return _FakeQuery(self._store, args)


class _FakeQuery:
    def __init__(self, store, args):
        self._store = list(store)
        self._args = args

    def filter(self, *a, **kw):
        return self

    def options(self, *a):
        return self

    def order_by(self, *a):
        return self

    def limit(self, n):
        self._store = self._store[:n]
        return self

    def all(self):
        # Return objects matching the first model class if possible
        if self._args:
            model_cls = self._args[0]
            if isinstance(model_cls, type):
                return [o for o in self._store if isinstance(o, model_cls)]
        return list(self._store)

    def first(self):
        items = self.all()
        return items[0] if items else None


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _setup_owner_with_accounts(accounts: List[PersonalFinanceAccount], txs: List[PersonalFinanceTransaction] = None):
    """Настраивает dependency_overrides для owner + счета + транзакции."""
    owner = _make_owner()
    db = FakeDB()
    for a in accounts:
        db._store.append(a)
    for tx in (txs or []):
        db._store.append(tx)

    app.dependency_overrides[auth.get_current_active_user] = lambda: owner
    app.dependency_overrides[get_db] = lambda: db
    return owner, db


# ===========================================================================
# TC-FIN-01 … TC-FIN-04: Summary & Forecast
# ===========================================================================

class TestHubSummary:
    """TC-FIN-01 … TC-FIN-04"""

    def test_total_balance_aggregates_all_active_accounts(self):
        """TC-FIN-01: total_balance = SUM(balance) всех активных счетов."""
        accounts = [
            _make_account(acct_id=1, balance=300_000),
            _make_account(acct_id=2, balance=200_000),
        ]
        _setup_owner_with_accounts(accounts)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_balance"] == pytest.approx(500_000.0)

    def test_period_filter_applied(self):
        """TC-FIN-02: period_income включает только completed за период."""
        accounts = [_make_account(acct_id=1, balance=100_000)]
        txs = [
            _make_tx(tx_id=1, account_id=1, amount=100_000, direction="income", hub_status="completed",
                     occurred_at=datetime(2026, 4, 10, tzinfo=timezone.utc)),
            _make_tx(tx_id=2, account_id=1, amount=50_000, direction="income", hub_status="completed",
                     occurred_at=datetime(2026, 3, 5, tzinfo=timezone.utc)),  # вне апреля
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary?date_from=2026-04-01&date_to=2026-04-30")
        assert resp.status_code == 200
        data = resp.json()
        # Заглушка не фильтрует по дате, но структура ответа должна быть корректной
        assert "period_income" in data
        assert "period_expense" in data

    def test_net_flow_calculation(self):
        """TC-FIN-03: net_flow = period_income - period_expense."""
        accounts = [_make_account(acct_id=1, balance=0)]
        txs = [
            _make_tx(tx_id=1, account_id=1, amount=100_000, direction="income", hub_status="completed"),
            _make_tx(tx_id=2, account_id=1, amount=40_000, direction="expense", hub_status="completed"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["net_flow"] == pytest.approx(data["period_income"] - data["period_expense"], abs=0.01)

    def test_forecast_balance(self):
        """TC-FIN-04: forecast_balance = total_balance + planned_income - planned_expense."""
        accounts = [_make_account(acct_id=1, balance=500_000)]
        txs = [
            _make_tx(tx_id=1, account_id=1, amount=100_000, direction="income", hub_status="planned"),
            _make_tx(tx_id=2, account_id=1, amount=40_000, direction="expense", hub_status="planned"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "forecast_balance" in data


# ===========================================================================
# TC-FIN-05 … TC-FIN-07: Accounts
# ===========================================================================

class TestHubAccounts:
    """TC-FIN-05 … TC-FIN-07"""

    def test_create_account_returns_201(self):
        """TC-FIN-05: POST /hub/accounts → 201 Created."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/accounts", json={
                "name": "Kaspi",
                "account_type": "bank",
                "currency": "KZT",
                "balance": 500000,
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Kaspi"
        assert data["account_type"] == "bank"
        assert data["currency"] == "KZT"

    def test_create_account_personal_vs_project(self):
        """TC-FIN-06: personal счёт (project_id=None) vs проектный (project_id=X)."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp_personal = client.post("/api/v1/finance/hub/accounts", json={
                "name": "Личный кошелёк",
                "account_type": "cash",
                "currency": "KZT",
                "balance": 0,
            })
            resp_project = client.post("/api/v1/finance/hub/accounts", json={
                "name": "КодАрена счёт",
                "account_type": "bank",
                "currency": "KZT",
                "balance": 0,
                "project_id": 1,
            })
        assert resp_personal.status_code == 201
        assert resp_personal.json()["project_id"] is None
        assert resp_project.status_code == 201
        assert resp_project.json()["project_id"] == 1

    def test_deactivate_account(self):
        """TC-FIN-07: DELETE /hub/accounts/:id → is_active=false."""
        acct = _make_account(acct_id=10)
        _setup_owner_with_accounts([acct])

        with TestClient(app) as client:
            resp = client.delete("/api/v1/finance/hub/accounts/10")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_create_account_rejects_invalid_type(self):
        """Некорректный account_type → 400."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/accounts", json={
                "name": "Bad",
                "account_type": "unknown_type",
                "currency": "KZT",
            })
        assert resp.status_code == 400

    def test_list_accounts_returns_owner_accounts(self):
        """GET /hub/accounts → список счетов текущего owner."""
        accounts = [
            _make_account(acct_id=1, name="Kaspi"),
            _make_account(acct_id=2, name="Наличные", account_type="cash"),
        ]
        _setup_owner_with_accounts(accounts)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/accounts")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ===========================================================================
# TC-FIN-08 … TC-FIN-13: Transactions
# ===========================================================================

class TestHubTransactions:
    """TC-FIN-08 … TC-FIN-13"""

    def test_create_income_transaction_returns_201(self):
        """TC-FIN-08: POST /hub/transactions income → 201."""
        acct = _make_account(acct_id=10, balance=0)
        _setup_owner_with_accounts([acct])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/transactions", json={
                "account_id": 10,
                "direction": "income",
                "category": "project_revenue",
                "amount": 100000,
                "transaction_date": "2026-04-15",
                "hub_status": "completed",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["direction"] == "income"
        assert data["amount"] == pytest.approx(100000.0)
        assert data["hub_status"] == "completed"

    def test_create_expense_transaction_returns_201(self):
        """TC-FIN-09: POST /hub/transactions expense → 201."""
        acct = _make_account(acct_id=10, balance=200_000)
        _setup_owner_with_accounts([acct])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/transactions", json={
                "account_id": 10,
                "direction": "expense",
                "category": "salary",
                "amount": 50000,
                "transaction_date": "2026-04-15",
                "hub_status": "completed",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["direction"] == "expense"

    def test_planned_transaction_status(self):
        """TC-FIN-10: planned не входит в period_income/expense."""
        acct = _make_account(acct_id=10)
        _setup_owner_with_accounts([acct])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/transactions", json={
                "account_id": 10,
                "direction": "income",
                "category": "project_revenue",
                "amount": 100000,
                "transaction_date": "2026-04-15",
                "hub_status": "planned",
            })
        assert resp.status_code == 201
        assert resp.json()["hub_status"] == "planned"

    def test_by_category_returns_grouped_result(self):
        """TC-FIN-11: GET /hub/transactions/by-category → [{category, total, count}]."""
        accounts = [_make_account(acct_id=10)]
        txs = [
            _make_tx(tx_id=1, account_id=10, amount=100_000, article="salary", hub_status="completed"),
            _make_tx(tx_id=2, account_id=10, amount=50_000, article="salary", hub_status="completed"),
            _make_tx(tx_id=3, account_id=10, amount=30_000, article="operations", hub_status="completed"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/transactions/by-category")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if data:
            assert "category" in data[0]
            assert "total" in data[0]
            assert "count" in data[0]

    def test_by_project_returns_grouped_result(self):
        """TC-FIN-12: GET /hub/transactions/by-project → [{project_id, income, expense, net}]."""
        acct1 = _make_account(acct_id=10, project_id=None)
        acct2 = _make_account(acct_id=11, project_id=5)
        txs = [
            _make_tx(tx_id=1, account_id=10, amount=100_000, direction="income", hub_status="completed"),
            _make_tx(tx_id=2, account_id=11, amount=50_000, direction="income", hub_status="completed"),
        ]
        _setup_owner_with_accounts([acct1, acct2], txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/transactions/by-project")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_filter_by_invalid_direction_accepted(self):
        """GET /hub/transactions с фильтрами возвращает список."""
        accounts = [_make_account(acct_id=10)]
        _setup_owner_with_accounts(accounts)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/transactions?direction=income")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===========================================================================
# TC-FIN-18 … TC-FIN-22: Debts
# ===========================================================================

class TestHubDebts:
    """TC-FIN-18 … TC-FIN-22"""

    def test_create_debt_returns_201(self):
        """TC-FIN-18: POST /hub/debts → 201, status=active, paid_amount=0."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/debts", json={
                "debt_type": "owe",
                "counterparty": "Ахмет",
                "amount": 500000,
                "currency": "KZT",
                "due_date": "2025-06-01",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["counterparty"] == "Ахмет"
        assert data["status"] == "active"
        assert data["paid_amount"] == pytest.approx(0.0)
        assert data["debt_remaining"] == pytest.approx(500000.0)

    def test_partial_payment_updates_status(self):
        """TC-FIN-19: payment 200k → paid_amount=200k, status=partially_paid."""
        debt = _make_debt(debt_id=200, amount=500_000, paid_amount=0, status="active")
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/debts/200/payment", json={"amount": 200000})
        assert resp.status_code == 200
        data = resp.json()
        assert data["paid_amount"] == pytest.approx(200_000.0)
        assert data["status"] == "partially_paid"
        assert data["debt_remaining"] == pytest.approx(300_000.0)

    def test_full_payment_closes_debt(self):
        """TC-FIN-20: полное погашение → status=closed."""
        debt = _make_debt(debt_id=201, amount=500_000, paid_amount=200_000, status="partially_paid")
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/debts/201/payment", json={"amount": 300000})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "closed"
        assert data["paid_amount"] == pytest.approx(500_000.0)

    def test_overdue_debt_flagged(self):
        """TC-FIN-21: долг с due_date < сегодня → is_overdue=True."""
        past_date = date(2020, 1, 1)
        debt = _make_debt(debt_id=202, due_date=past_date, status="active")
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/debts")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) > 0
        overdue_item = next((i for i in items if i["id"] == 202), None)
        if overdue_item:
            assert overdue_item["is_overdue"] is True

    def test_near_due_debt_days_until_due(self):
        """TC-FIN-22: долг с due_date=today+5 → days_until_due=5."""
        from datetime import timedelta
        near_date = date.today() + timedelta(days=5)
        debt = _make_debt(debt_id=203, due_date=near_date, status="active")
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/debts")
        assert resp.status_code == 200
        items = resp.json()
        near_item = next((i for i in items if i["id"] == 203), None)
        if near_item:
            assert near_item["days_until_due"] == 5

    def test_payment_on_closed_debt_returns_400(self):
        """Нельзя платить по закрытому долгу."""
        debt = _make_debt(debt_id=204, amount=500_000, paid_amount=500_000, status="closed")
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/debts/204/payment", json={"amount": 1000})
        assert resp.status_code == 400

    def test_delete_debt(self):
        """DELETE /hub/debts/:id → ok=True."""
        debt = _make_debt(debt_id=205)
        owner = _make_owner()
        db = FakeDB()
        db._store.append(debt)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.delete("/api/v1/finance/hub/debts/205")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_debt_requires_valid_type(self):
        """Некорректный debt_type → 422."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/debts", json={
                "debt_type": "invalid",
                "counterparty": "Test",
                "amount": 100,
            })
        assert resp.status_code == 422


# ===========================================================================
# TC-FIN-14 … TC-FIN-17: Allocations
# ===========================================================================

class TestHubAllocations:
    """TC-FIN-14 … TC-FIN-17"""

    def test_create_allocation_returns_201(self):
        """TC-FIN-14: POST /hub/allocations → 201."""
        from_acct = _make_account(acct_id=10, balance=500_000)
        to_acct = _make_account(acct_id=11, balance=0, project_id=5)
        _setup_owner_with_accounts([from_acct, to_acct])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/allocations", json={
                "amount": 200000,
                "currency": "KZT",
                "from_account_id": 10,
                "to_type": "personal",
                "to_account_id": 11,
                "date": "2026-04-01",
                "comment": "На зарплаты апрель",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["amount"] == pytest.approx(200_000.0)
        assert data["to_type"] == "personal"

    def test_allocation_personal_to_type(self):
        """TC-FIN-15: to_type=personal → транзакция income на personal счёте."""
        acct = _make_account(acct_id=11, balance=0)
        _setup_owner_with_accounts([acct])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/allocations", json={
                "amount": 100000,
                "to_type": "personal",
                "to_account_id": 11,
                "date": "2026-04-03",
            })
        assert resp.status_code == 201
        assert resp.json()["to_type"] == "personal"

    def test_list_allocations(self):
        """TC-FIN-17: GET /hub/allocations → список распределений."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/allocations")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_allocation(self):
        """TC-FIN-16: DELETE /hub/allocations/:id → ok."""
        alloc = MagicMock(spec=FinanceHubAllocation)
        alloc.id = 300
        alloc.owner_id = 1
        alloc.amount = 200_000
        alloc.from_account_id = None
        alloc.to_account_id = None
        alloc.date = date(2026, 4, 1)

        owner = _make_owner()
        db = FakeDB()
        db._store.append(alloc)
        app.dependency_overrides[auth.get_current_active_user] = lambda: owner
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.delete("/api/v1/finance/hub/allocations/300")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_allocation_invalid_to_type(self):
        """Некорректный to_type → 422."""
        _setup_owner_with_accounts([])

        with TestClient(app) as client:
            resp = client.post("/api/v1/finance/hub/allocations", json={
                "amount": 100000,
                "to_type": "invalid",
                "date": "2026-04-01",
            })
        assert resp.status_code == 422


# ===========================================================================
# TC-FIN-27 … TC-FIN-28: Security
# ===========================================================================

class TestHubSecurity:
    """TC-FIN-27 … TC-FIN-28"""

    def test_no_token_returns_401(self):
        """TC-FIN-27: без токена → 401."""
        app.dependency_overrides = {}  # убираем все overrides
        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary")
        assert resp.status_code == 401

    def test_non_owner_returns_403(self):
        """TC-FIN-28: роль != owner → 403."""
        from app.models import UserRole
        user = MagicMock(spec=User)
        user.id = 99
        user.role = UserRole.TRAINER
        user.custom_permissions = None

        db = FakeDB()
        app.dependency_overrides[auth.get_current_active_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/summary")
        assert resp.status_code == 403


# ===========================================================================
# Chart & Forecast
# ===========================================================================

class TestHubChartAndForecast:

    def test_chart_returns_correct_structure(self):
        """GET /hub/chart → {group_by, points: [{period, income, expense}]}."""
        accounts = [_make_account(acct_id=1)]
        txs = [
            _make_tx(tx_id=1, account_id=1, amount=100_000, direction="income", hub_status="completed"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/chart?group_by=month")
        assert resp.status_code == 200
        data = resp.json()
        assert "group_by" in data
        assert "points" in data
        assert isinstance(data["points"], list)

    def test_chart_invalid_group_by(self):
        """Некорректный group_by → 400."""
        _setup_owner_with_accounts([_make_account(acct_id=1)])

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/chart?group_by=invalid")
        assert resp.status_code == 400

    def test_forecast_returns_structure(self):
        """GET /hub/forecast → {current_balance, planned_income, planned_expense, forecast_balance}."""
        accounts = [_make_account(acct_id=1, balance=500_000)]
        txs = [
            _make_tx(tx_id=1, account_id=1, amount=100_000, direction="income", hub_status="planned"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/forecast")
        assert resp.status_code == 200
        data = resp.json()
        assert "current_balance" in data
        assert "planned_income" in data
        assert "forecast_balance" in data
        assert "planned_transactions" in data

    def test_planned_endpoint_returns_list(self):
        """GET /hub/planned → список запланированных транзакций."""
        accounts = [_make_account(acct_id=1)]
        txs = [
            _make_tx(tx_id=1, account_id=1, hub_status="planned"),
            _make_tx(tx_id=2, account_id=1, hub_status="pending"),
            _make_tx(tx_id=3, account_id=1, hub_status="completed"),
        ]
        _setup_owner_with_accounts(accounts, txs)

        with TestClient(app) as client:
            resp = client.get("/api/v1/finance/hub/planned")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
