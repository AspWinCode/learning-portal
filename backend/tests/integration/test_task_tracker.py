"""
Интеграционные тесты для таск-трекера (app/routers/tasks.py).

Покрывают:
1. CRUD шаблонов задач (/task-templates) + права tasks.manage
2. CRUD задач (/tasks): создание вручную и из шаблона, фильтры status/category
3. Прогресс задачи и авто-архивация при 100% выполнении подзадач
4. Повторяющиеся задачи: завершение создаёт новую активную копию
5. Ручное завершение (/complete), откладывание (/postpone), pin-today
6. Счётчики (/counters/increment): валидные и невалидные ключи
7. Видимость задач для sales/trainer (свои + неназначенные)
8. Представления: /tasks/today (today|overdue|active), /tasks/stats
9. day-desk-summary: группировка
"""
from datetime import timedelta

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth
from app.database import Base, get_db
from app.main import app
from app.models import Student, Task, TaskStatus, User
from app.routers.tasks import _today_msk


# ---------------------------------------------------------------------------
# Fixtures
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
def make_client(db_session):
    """Фабрика TestClient для произвольного текущего пользователя."""
    def _make(user):
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[auth.get_current_active_user] = lambda: user
        return TestClient(app)
    yield _make
    app.dependency_overrides = {}


@pytest.fixture
def client(make_client, owner):
    return make_client(owner)


def _make_student(db, full_name="Student"):
    student = Student(full_name=full_name)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _create_task(client, **overrides):
    body = {"title": "Задача", "subtasks": [{"text": "Шаг 1"}, {"text": "Шаг 2"}]}
    body.update(overrides)
    r = client.post("/api/v1/tasks", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# 1. Шаблоны задач
# ---------------------------------------------------------------------------

class TestTaskTemplates:
    def test_create_template_with_subtasks(self, client):
        r = client.post("/api/v1/task-templates", json={
            "name": "  Звонок родителю  ",
            "subtasks": [{"text": "Набрать", "order": 0}, {"text": "Записать итог", "order": 1}],
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["name"] == "Звонок родителю"  # обрезка пробелов
        assert [s["text"] for s in data["subtasks"]] == ["Набрать", "Записать итог"]
        assert data["repeat_enabled"] is False

    def test_create_template_with_students(self, client, db_session):
        student = _make_student(db_session)
        r = client.post("/api/v1/task-templates", json={
            "name": "С учеником", "student_ids": [student.id],
        })
        assert r.status_code == 201, r.text
        assert r.json()["student_ids"] == [student.id]

    def test_list_templates(self, client):
        client.post("/api/v1/task-templates", json={"name": "T1"})
        client.post("/api/v1/task-templates", json={"name": "T2"})
        r = client.get("/api/v1/task-templates")
        assert r.status_code == 200
        assert {t["name"] for t in r.json()} == {"T1", "T2"}

    def test_get_template(self, client):
        tid = client.post("/api/v1/task-templates", json={"name": "T"}).json()["id"]
        r = client.get(f"/api/v1/task-templates/{tid}")
        assert r.status_code == 200
        assert r.json()["id"] == tid

    def test_get_template_404(self, client):
        assert client.get("/api/v1/task-templates/9999").status_code == 404

    def test_update_template_replaces_subtasks(self, client):
        tid = client.post("/api/v1/task-templates", json={
            "name": "T", "subtasks": [{"text": "old"}],
        }).json()["id"]
        r = client.put(f"/api/v1/task-templates/{tid}", json={
            "name": "T new", "subtasks": [{"text": "a"}, {"text": "b"}],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "T new"
        assert [s["text"] for s in data["subtasks"]] == ["a", "b"]

    def test_delete_template(self, client):
        tid = client.post("/api/v1/task-templates", json={"name": "T"}).json()["id"]
        assert client.delete(f"/api/v1/task-templates/{tid}").status_code == 204
        assert client.get(f"/api/v1/task-templates/{tid}").status_code == 404

    def test_delete_template_404(self, client):
        assert client.delete("/api/v1/task-templates/9999").status_code == 404

    def test_sales_cannot_manage_templates(self, make_client, db_session):
        sales = _make_user(db_session, "sales@x.com", "sales", "Sales")
        sclient = make_client(sales)
        assert sclient.get("/api/v1/task-templates").status_code == 403
        assert sclient.post("/api/v1/task-templates", json={"name": "X"}).status_code == 403


# ---------------------------------------------------------------------------
# 2. CRUD задач
# ---------------------------------------------------------------------------

class TestTaskCrud:
    def test_create_task_with_subtasks(self, client):
        data = _create_task(client, title="Моя задача")
        assert data["title"] == "Моя задача"
        assert data["status"] == "active"
        assert data["category"] == "schools"  # дефолт
        assert len(data["subtasks"]) == 2
        assert data["progress"] == 0.0

    def test_create_task_defaults_title_from_template(self, client):
        tid = client.post("/api/v1/task-templates", json={
            "name": "Из шаблона", "subtasks": [{"text": "s1"}, {"text": "s2"}],
        }).json()["id"]
        r = client.post("/api/v1/tasks", json={"template_id": tid})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["title"] == "Из шаблона"
        assert [s["text"] for s in data["subtasks"]] == ["s1", "s2"]

    def test_create_task_template_404(self, client):
        r = client.post("/api/v1/tasks", json={"template_id": 9999})
        assert r.status_code == 404

    def test_create_task_with_category(self, client):
        data = _create_task(client, category="parents")
        assert data["category"] == "parents"

    def test_get_task(self, client):
        tid = _create_task(client)["id"]
        r = client.get(f"/api/v1/tasks/{tid}")
        assert r.status_code == 200
        assert r.json()["id"] == tid

    def test_get_task_404(self, client):
        assert client.get("/api/v1/tasks/9999").status_code == 404

    def test_update_task_fields(self, client):
        tid = _create_task(client)["id"]
        r = client.put(f"/api/v1/tasks/{tid}", json={
            "title": "Обновлено", "priority": "high", "category": "leads",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "Обновлено"
        assert data["priority"] == "high"
        assert data["category"] == "leads"

    def test_update_task_404(self, client):
        assert client.put("/api/v1/tasks/9999", json={"title": "x"}).status_code == 404

    def test_delete_task(self, client):
        tid = _create_task(client)["id"]
        assert client.delete(f"/api/v1/tasks/{tid}").status_code == 204
        assert client.get(f"/api/v1/tasks/{tid}").status_code == 404

    def test_list_tasks_filter_by_status_and_category(self, client):
        _create_task(client, category="schools")
        parents_id = _create_task(client, category="parents")["id"]
        # архивируем одну
        client.put(f"/api/v1/tasks/{parents_id}", json={"status": "archived"})

        active = client.get("/api/v1/tasks", params={"status_filter": "active"}).json()
        assert all(t["status"] == "active" for t in active)

        parents = client.get("/api/v1/tasks", params={"category": "parents"}).json()
        assert all(t["category"] == "parents" for t in parents)
        assert parents_id in [t["id"] for t in parents]


# ---------------------------------------------------------------------------
# 3. Прогресс и авто-архивация
# ---------------------------------------------------------------------------

class TestProgressAndAutoArchive:
    def test_progress_reflects_completed_subtasks(self, client):
        task = _create_task(client)
        tid = task["id"]
        sub = task["subtasks"][0]
        r = client.patch(f"/api/v1/tasks/{tid}/subtasks/{sub['id']}", json={"completed": True})
        assert r.status_code == 200, r.text
        # 1 из 2 = 50%
        assert client.get(f"/api/v1/tasks/{tid}").json()["progress"] == 50.0

    def test_task_auto_archived_when_all_subtasks_done(self, client):
        task = _create_task(client)
        tid = task["id"]
        for sub in task["subtasks"]:
            client.patch(f"/api/v1/tasks/{tid}/subtasks/{sub['id']}", json={"completed": True})
        data = client.get(f"/api/v1/tasks/{tid}").json()
        assert data["status"] == "archived"
        assert data["progress"] == 100.0

    def test_subtask_404(self, client):
        tid = _create_task(client)["id"]
        r = client.patch(f"/api/v1/tasks/{tid}/subtasks/9999", json={"completed": True})
        assert r.status_code == 404

    def test_subtask_task_404(self, client):
        r = client.patch("/api/v1/tasks/9999/subtasks/1", json={"completed": True})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 4. Повторяющиеся задачи
# ---------------------------------------------------------------------------

class TestRepeatingTasks:
    def test_completing_repeating_task_spawns_new_active(self, client, db_session):
        task = _create_task(client, repeat_enabled=True, repeat_frequency="daily")
        tid = task["id"]
        for sub in task["subtasks"]:
            client.patch(f"/api/v1/tasks/{tid}/subtasks/{sub['id']}", json={"completed": True})

        # Старая ушла в архив
        assert client.get(f"/api/v1/tasks/{tid}").json()["status"] == "archived"
        # Появилась новая активная копия с теми же подзадачами (не выполненными)
        active = db_session.query(Task).filter(
            Task.status == TaskStatus.ACTIVE.value, Task.repeat_enabled.is_(True)
        ).all()
        assert len(active) == 1
        new_task = active[0]
        assert new_task.id != tid
        assert new_task.title == task["title"]
        assert all(not s.completed for s in new_task.subtasks)


# ---------------------------------------------------------------------------
# 5. complete / postpone / pin-today
# ---------------------------------------------------------------------------

class TestTaskActions:
    def test_complete_task_without_subtasks(self, client):
        r = client.post("/api/v1/tasks", json={"title": "Без подзадач", "subtasks": []})
        tid = r.json()["id"]
        done = client.post(f"/api/v1/tasks/{tid}/complete")
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "archived"

    def test_complete_already_archived_is_noop(self, client):
        tid = _create_task(client)["id"]
        client.put(f"/api/v1/tasks/{tid}", json={"status": "archived"})
        r = client.post(f"/api/v1/tasks/{tid}/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "archived"

    def test_postpone_sets_scheduled_tomorrow(self, client):
        today_msk, _, _ = _today_msk()
        tid = _create_task(client)["id"]
        r = client.patch(f"/api/v1/tasks/{tid}/postpone")
        assert r.status_code == 200, r.text
        assert r.json()["scheduled_for"] == (today_msk + timedelta(days=1)).isoformat()

    def test_postpone_existing_scheduled_adds_one_day(self, client):
        today_msk, _, _ = _today_msk()
        tid = _create_task(client, scheduled_for=today_msk.isoformat())["id"]
        r = client.patch(f"/api/v1/tasks/{tid}/postpone")
        assert r.json()["scheduled_for"] == (today_msk + timedelta(days=1)).isoformat()

    def test_pin_today_toggle(self, client):
        tid = _create_task(client)["id"]
        assert client.patch(f"/api/v1/tasks/{tid}/pin-today").json()["pinned_today"] is True
        assert client.patch(
            f"/api/v1/tasks/{tid}/pin-today", params={"pinned": "false"}
        ).json()["pinned_today"] is False


# ---------------------------------------------------------------------------
# 6. Счётчики
# ---------------------------------------------------------------------------

class TestCounters:
    def test_increment_counter(self, client):
        tid = _create_task(client)["id"]
        r = client.post(f"/api/v1/tasks/{tid}/counters/increment",
                        json={"key": "parent_replies", "delta": 2})
        assert r.status_code == 200, r.text
        assert r.json()["counters"]["parent_replies"] == 2
        # ещё +1 (дефолтный delta)
        r2 = client.post(f"/api/v1/tasks/{tid}/counters/increment", json={"key": "parent_replies"})
        assert r2.json()["counters"]["parent_replies"] == 3

    def test_increment_unsupported_key(self, client):
        tid = _create_task(client)["id"]
        r = client.post(f"/api/v1/tasks/{tid}/counters/increment", json={"key": "bogus"})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# 7. Видимость для sales / trainer
# ---------------------------------------------------------------------------

class TestVisibility:
    def test_sales_sees_own_and_unassigned_only(self, make_client, db_session, owner):
        sales = _make_user(db_session, "sales@x.com", "sales", "Sales")
        other = _make_user(db_session, "other@x.com", "sales", "Other")
        oclient = make_client(owner)
        own = _create_task(oclient, assigned_to_id=sales.id)["id"]
        unassigned = _create_task(oclient)["id"]
        foreign = _create_task(oclient, assigned_to_id=other.id)["id"]

        sclient = make_client(sales)
        visible = {t["id"] for t in sclient.get("/api/v1/tasks").json()}
        assert own in visible
        assert unassigned in visible
        assert foreign not in visible

    def test_sales_cannot_get_foreign_task(self, make_client, db_session, owner):
        sales = _make_user(db_session, "sales@x.com", "sales", "Sales")
        other = _make_user(db_session, "other@x.com", "sales", "Other")
        foreign = _create_task(make_client(owner), assigned_to_id=other.id)["id"]
        r = make_client(sales).get(f"/api/v1/tasks/{foreign}")
        assert r.status_code == 403

    def test_trainer_sees_only_assigned(self, make_client, db_session, owner):
        trainer = _make_user(db_session, "tr@x.com", "trainer", "Trainer")
        oclient = make_client(owner)
        own = _create_task(oclient, assigned_to_id=trainer.id)["id"]
        _create_task(oclient)  # неназначенная — trainer её не видит

        visible = {t["id"] for t in make_client(trainer).get("/api/v1/tasks").json()}
        assert visible == {own}


# ---------------------------------------------------------------------------
# 8. Представления today / stats
# ---------------------------------------------------------------------------

class TestTodayView:
    def test_today_includes_freshly_created_task(self, client):
        tid = _create_task(client)["id"]
        r = client.get("/api/v1/tasks/today", params={"mode": "today"})
        assert r.status_code == 200, r.text
        assert tid in [t["id"] for t in r.json()]

    def test_overdue_lists_past_scheduled(self, client):
        today_msk, _, _ = _today_msk()
        overdue_id = _create_task(client, scheduled_for=(today_msk - timedelta(days=2)).isoformat())["id"]
        r = client.get("/api/v1/tasks/today", params={"mode": "overdue"})
        assert overdue_id in [t["id"] for t in r.json()]

    def test_today_excludes_overdue(self, client):
        today_msk, _, _ = _today_msk()
        overdue_id = _create_task(client, scheduled_for=(today_msk - timedelta(days=2)).isoformat())["id"]
        today_ids = [t["id"] for t in client.get("/api/v1/tasks/today", params={"mode": "today"}).json()]
        assert overdue_id not in today_ids

    def test_active_mode_returns_all_active(self, client):
        a = _create_task(client)["id"]
        b = _create_task(client, scheduled_for=(_today_msk()[0] - timedelta(days=2)).isoformat())["id"]
        ids = [t["id"] for t in client.get("/api/v1/tasks/today", params={"mode": "active"}).json()]
        assert a in ids and b in ids

    def test_invalid_mode_rejected(self, client):
        assert client.get("/api/v1/tasks/today", params={"mode": "nope"}).status_code == 422


class TestStats:
    def test_stats_counts_completed_today(self, client):
        tid = _create_task(client)["id"]
        # завершаем все подзадачи -> архив (updated_at = сейчас, попадает в сегодня)
        task = client.get(f"/api/v1/tasks/{tid}").json()
        for sub in task["subtasks"]:
            client.patch(f"/api/v1/tasks/{tid}/subtasks/{sub['id']}", json={"completed": True})
        r = client.get("/api/v1/tasks/stats")
        assert r.status_code == 200, r.text
        assert r.json()["completed_count"] >= 1

    def test_stats_invalid_date(self, client):
        assert client.get("/api/v1/tasks/stats", params={"day": "not-a-date"}).status_code == 400


# ---------------------------------------------------------------------------
# 9. Day desk summary
# ---------------------------------------------------------------------------

class TestDayDesk:
    def test_day_desk_groups_present(self, client):
        # scheduled_for=today, чтобы попасть в группу parents (на SQLite created_at — naive)
        today_msk, _, _ = _today_msk()
        _create_task(client, category="parents", scheduled_for=today_msk.isoformat())
        r = client.get("/api/v1/tasks/day-desk-summary")
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("urgent", "parents", "makeups", "payments", "operations", "leads"):
            assert key in data
        assert set(data["stats"].keys()) == {"overdue", "today", "completed_today", "overload"}

    def test_day_desk_overdue_goes_to_urgent(self, client):
        today_msk, _, _ = _today_msk()
        overdue_id = _create_task(client, scheduled_for=(today_msk - timedelta(days=1)).isoformat())["id"]
        data = client.get("/api/v1/tasks/day-desk-summary").json()
        assert overdue_id in [t["id"] for t in data["urgent"]]
        assert data["stats"]["overdue"] >= 1
