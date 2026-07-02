"""
Интеграционные тесты для POST /tasks/{task_id}/subtasks/bulk.

Покрывают 13 частных случаев:
1.  Нормальный запрос — несколько подзадач создаются
2.  1 подзадача (минимум массива)
3.  50 подзадач (максимум)
4.  Пустой массив titles → 422
5.  51 элемент → 422
6.  Пустая строка после trim() → 422
7.  Строка > 255 символов → 422
8.  task_id не существует → 404
9.  Дубликаты строк — создаются все
10. order продолжается от максимального существующего
11. Пользователь без rights tasks.manage (sales) → 403
12. Строка только из пробелов → 422
13. Схема ответа: created == len(subtasks), у каждой subtask правильный task_id
"""
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth
from app.database import Base, get_db
from app.main import app
from app.models import User


# ---------------------------------------------------------------------------
# Fixtures (повторяют паттерн из test_task_tracker.py)
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = sa.create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _make_user(db, email, role="owner", full_name="User"):
    user = User(email=email, hashed_password="x", full_name=full_name, role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def owner(db_session):
    return _make_user(db_session, "owner@x.com", "owner", "Owner")


@pytest.fixture
def sales_user(db_session):
    return _make_user(db_session, "sales@x.com", "sales", "Sales")


@pytest.fixture
def make_client(db_session):
    def _make(user):
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[auth.get_current_active_user] = lambda: user
        return TestClient(app)
    yield _make
    app.dependency_overrides = {}


@pytest.fixture
def client(make_client, owner):
    return make_client(owner)


def _create_task(client, **overrides):
    body = {"title": "Задача для bulk", "subtasks": []}
    body.update(overrides)
    r = client.post("/api/v1/tasks", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _bulk_url(task_id):
    return f"/api/v1/tasks/{task_id}/subtasks/bulk"


# ---------------------------------------------------------------------------
# Тесты
# ---------------------------------------------------------------------------

class TestSubtasksBulk:

    # 1. Нормальный запрос — несколько подзадач
    def test_bulk_create_happy_path(self, client):
        task_id = _create_task(client)["id"]
        titles = ["Шаг A", "Шаг B", "Шаг C"]
        r = client.post(_bulk_url(task_id), json={"titles": titles})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["created"] == 3
        assert len(data["subtasks"]) == 3
        assert [s["text"] for s in data["subtasks"]] == titles

    # 2. 1 подзадача (минимум)
    def test_bulk_create_single_item(self, client):
        task_id = _create_task(client)["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["Единственный шаг"]})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["created"] == 1
        assert data["subtasks"][0]["text"] == "Единственный шаг"

    # 3. 50 подзадач (максимум)
    def test_bulk_create_fifty_items(self, client):
        task_id = _create_task(client)["id"]
        titles = [f"Подзадача {i}" for i in range(50)]
        r = client.post(_bulk_url(task_id), json={"titles": titles})
        assert r.status_code == 201, r.text
        assert r.json()["created"] == 50

    # 4. Пустой массив → 422
    def test_empty_titles_rejected(self, client):
        task_id = _create_task(client)["id"]
        r = client.post(_bulk_url(task_id), json={"titles": []})
        assert r.status_code == 422

    # 5. 51 элемент → 422
    def test_too_many_titles_rejected(self, client):
        task_id = _create_task(client)["id"]
        titles = [f"item {i}" for i in range(51)]
        r = client.post(_bulk_url(task_id), json={"titles": titles})
        assert r.status_code == 422

    # 6. Пустая строка после trim() → 422
    def test_empty_string_after_trim_rejected(self, client):
        task_id = _create_task(client)["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["Нормальная", ""]})
        assert r.status_code == 422

    # 7. Строка > 255 символов → 422
    def test_title_too_long_rejected(self, client):
        task_id = _create_task(client)["id"]
        long_title = "x" * 256
        r = client.post(_bulk_url(task_id), json={"titles": [long_title]})
        assert r.status_code == 422

    # 8. task_id не существует → 404
    def test_task_not_found(self, client):
        r = client.post(_bulk_url(99999), json={"titles": ["Что-то"]})
        assert r.status_code == 404

    # 9. Дубликаты строк — создаются все (без дедупликации)
    def test_duplicate_titles_all_created(self, client):
        task_id = _create_task(client)["id"]
        titles = ["Дублирующая подзадача"] * 3
        r = client.post(_bulk_url(task_id), json={"titles": titles})
        assert r.status_code == 201, r.text
        assert r.json()["created"] == 3

    # 10. order продолжается от максимального существующего
    def test_order_continues_from_existing(self, client, db_session):
        task_id = _create_task(client, subtasks=[
            {"text": "Первая", "order": 0},
            {"text": "Вторая", "order": 1},
        ])["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["Новая 1", "Новая 2"]})
        assert r.status_code == 201, r.text
        orders = [s["order"] for s in r.json()["subtasks"]]
        assert orders == [2, 3]

    # 11. sales пользователь → 403 (нет rights tasks.manage)
    def test_sales_user_forbidden(self, make_client, sales_user):
        sclient = make_client(sales_user)
        r = sclient.post(_bulk_url(1), json={"titles": ["Шаг"]})
        assert r.status_code == 403

    # 12. Строка только из пробелов → 422
    def test_whitespace_only_title_rejected(self, client):
        task_id = _create_task(client)["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["   ", "Нормальная"]})
        assert r.status_code == 422

    # 13. Схема ответа: created == len(subtasks), task_id корректный, status open
    def test_response_schema_correctness(self, client):
        task_id = _create_task(client)["id"]
        titles = ["Alpha", "Beta"]
        r = client.post(_bulk_url(task_id), json={"titles": titles})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["created"] == len(data["subtasks"])
        for sub in data["subtasks"]:
            assert sub["task_id"] == task_id
            assert sub["completed"] is False
            assert "id" in sub
            assert "order" in sub

    # 14. titles trim работает: пробелы по краям обрезаются
    def test_titles_are_trimmed(self, client):
        task_id = _create_task(client)["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["  Обрезать меня  "]})
        assert r.status_code == 201, r.text
        assert r.json()["subtasks"][0]["text"] == "Обрезать меня"

    # 15. Строка ровно 255 символов — проходит валидацию
    def test_title_exactly_255_chars_accepted(self, client):
        task_id = _create_task(client)["id"]
        title = "я" * 255
        r = client.post(_bulk_url(task_id), json={"titles": [title]})
        assert r.status_code == 201, r.text
        assert r.json()["subtasks"][0]["text"] == title

    # 16. Задача без существующих подзадач: order начинается с 0
    def test_order_starts_from_zero_when_no_existing_subtasks(self, client):
        task_id = _create_task(client, subtasks=[])["id"]
        r = client.post(_bulk_url(task_id), json={"titles": ["Первая"]})
        assert r.status_code == 201, r.text
        assert r.json()["subtasks"][0]["order"] == 0
