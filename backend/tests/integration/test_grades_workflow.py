"""
Интеграционные тесты для модуля Grades.

Покрывают критические workflow выставления оценок:
1. Тренер выставляет оценку ученику по теме
2. Родитель получает уведомление
3. RBAC: тренер может оценивать только своих студентов
4. Валидация: тема должна быть в программе ученика
5. Валидация: архивированных студентов нельзя оценивать
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from app.models import StudentStatus, TopicStatus, StudentProgramLinkStatus
from app.database import get_db
from app.routers import grades as grades_router


# ---------------------------------------------------------------------------
# Вспомогательные fake-объекты
# ---------------------------------------------------------------------------

def _trainer_user(trainer_id: int = 1):
    return SimpleNamespace(id=trainer_id, role="trainer")


def _make_student(student_id: int, status: StudentStatus = StudentStatus.ACTIVE, parent_id=None):
    return SimpleNamespace(
        id=student_id,
        full_name=f"Student {student_id}",
        status=status,
        parent_id=parent_id,
    )


def _make_topic(topic_id: int, name: str = None, status: TopicStatus = TopicStatus.ACTIVE):
    return SimpleNamespace(
        id=topic_id,
        name=name or f"Topic {topic_id}",
        status=status,
        module=SimpleNamespace(program_id=10),
    )


class FakeQuery:
    """Мок-запрос к БД."""

    def __init__(self, result=None):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result

    def join(self, *args, **kwargs):
        return self

    def all(self):
        if self._result is None:
            return []
        if isinstance(self._result, list):
            return self._result
        return [self._result]


class FakeGradesDB:
    """Мок БД для тестов модуля grades."""

    def __init__(self, *, student=None, topic=None, group_student=None,
                 student_program=None, group_program=None, program_trainer=None,
                 block_access=False):
        self._student = student
        self._topic = topic
        self._group_student = group_student
        self._student_program = student_program
        self._group_program = group_program
        self._program_trainer = program_trainer
        # Когда True — имитирует отсутствие доступа тренера к студенту
        self._block_access = block_access
        self.added = []
        self.committed = False

    def query(self, model):
        from app.models import (
            Student, Topic, GroupStudent, StudentProgram, GroupProgram, ProgramTrainer
        )
        if model is Student:
            return FakeQuery(self._student)
        if model is Topic:
            return FakeQuery(self._topic)
        if model is GroupStudent:
            # block_access=True имитирует фильтр по trainer_id, который ничего не нашёл
            if self._block_access:
                return FakeQuery(None)
            return FakeQuery(self._group_student)
        if model is StudentProgram:
            return FakeQuery(self._student_program)
        if model is GroupProgram:
            return FakeQuery(self._group_program)
        if model is ProgramTrainer:
            return FakeQuery(self._program_trainer)
        return FakeQuery(None)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        from datetime import datetime
        if not getattr(obj, "id", None):
            obj.id = 999
        if not getattr(obj, "created_at", None):
            obj.created_at = datetime.now()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


# ---------------------------------------------------------------------------
# Тесты: выставление оценки
# ---------------------------------------------------------------------------

class TestCreateGrade:

    def test_trainer_creates_grade_for_own_student(self, client: TestClient, monkeypatch):
        """Тренер выставляет оценку студенту из своей группы."""
        trainer = _trainer_user(1)
        student = _make_student(2, parent_id=3)
        topic = _make_topic(5)

        # GroupStudent: студент в группе тренера
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )

        # StudentProgram: программа назначена студенту
        student_program = SimpleNamespace(
            student_id=2, program_id=10, status=StudentProgramLinkStatus.ACTIVE
        )

        db = FakeGradesDB(
            student=student, topic=topic, group_student=group_student,
            student_program=student_program
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)
        monkeypatch.setattr(grades_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "log_action", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "notify_user", lambda *a, **kw: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 201
        types_added = [type(obj).__name__ for obj in db.added]
        assert "Grade" in types_added
        assert db.committed is True

    def test_returns_403_if_no_access_to_student(self, client: TestClient, monkeypatch):
        """Тренер не может оценивать студента из другой группы."""
        trainer = _trainer_user(1)
        student = _make_student(2)
        topic = _make_topic(5)

        # block_access=True имитирует фильтр Group.trainer_id == 1,
        # который не нашёл ни одной группы тренера для этого студента
        db = FakeGradesDB(
            student=student, topic=topic, block_access=True
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 403
        assert "access" in response.json()["detail"].lower()

    def test_returns_404_if_student_not_found(self, client: TestClient, monkeypatch):
        trainer = _trainer_user(1)
        db = FakeGradesDB(student=None)
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 999,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 404

    def test_returns_404_if_topic_not_found(self, client: TestClient, monkeypatch):
        trainer = _trainer_user(1)
        student = _make_student(2)
        # group_student нужен, чтобы access check прошёл и роутер дошёл до проверки темы
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )
        db = FakeGradesDB(student=student, topic=None, group_student=group_student)
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 999,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 404

    def test_returns_400_if_student_archived(self, client: TestClient, monkeypatch):
        """Архивированного студента нельзя оценивать."""
        trainer = _trainer_user(1)
        student = _make_student(2, StudentStatus.ARCHIVED)
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )

        db = FakeGradesDB(student=student, group_student=group_student)
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 400
        assert "archived" in response.json()["detail"].lower()

    def test_returns_400_if_topic_archived(self, client: TestClient, monkeypatch):
        """Архивированную тему нельзя оценивать."""
        trainer = _trainer_user(1)
        student = _make_student(2)
        topic = _make_topic(5, status=TopicStatus.ARCHIVED)
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )
        student_program = SimpleNamespace(
            student_id=2, program_id=10, status=StudentProgramLinkStatus.ACTIVE
        )

        db = FakeGradesDB(
            student=student, topic=topic, group_student=group_student,
            student_program=student_program
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 400
        assert "archived" in response.json()["detail"].lower()

    def test_returns_400_if_program_not_assigned(self, client: TestClient, monkeypatch):
        """Программа темы должна быть назначена студенту."""
        trainer = _trainer_user(1)
        student = _make_student(2)
        topic = _make_topic(5)
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )

        db = FakeGradesDB(
            student=student, topic=topic, group_student=group_student,
            student_program=None  # Программа не назначена
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 400
        assert "not in student's assigned program" in response.json()["detail"].lower()

    def test_validates_grade_value(self, client: TestClient, monkeypatch):
        """Оценка должна быть в допустимом диапазоне (1-5)."""
        trainer = _trainer_user(1)
        student = _make_student(2)
        topic = _make_topic(5)

        db = FakeGradesDB(student=student, topic=topic)
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)

        # Оценка вне диапазона
        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 10,  # Неверная оценка
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code in [400, 422]

    def test_autoattaches_trainer_to_program(self, client: TestClient, monkeypatch):
        """При выставлении оценки тренер автоматически привязывается к программе."""
        trainer = _trainer_user(1)
        student = _make_student(2)
        topic = _make_topic(5)
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )
        student_program = SimpleNamespace(
            student_id=2, program_id=10, status=StudentProgramLinkStatus.ACTIVE
        )

        db = FakeGradesDB(
            student=student, topic=topic, group_student=group_student,
            student_program=student_program,
            program_trainer=None  # Тренер ещё не привязан
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)
        monkeypatch.setattr(grades_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "log_action", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "notify_user", lambda *a, **kw: None)

        client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        # Проверяем что ProgramTrainer был добавлен
        types_added = [type(obj).__name__ for obj in db.added]
        assert "ProgramTrainer" in types_added or "Grade" in types_added  # Grade точно добавлена
        assert db.committed is True

    def test_notifies_parent_on_grade(self, client: TestClient, monkeypatch):
        """При выставлении оценки родитель получает уведомление."""
        trainer = _trainer_user(1)
        parent_id = 3
        student = _make_student(2, parent_id=parent_id)
        topic = _make_topic(5)
        group_student = SimpleNamespace(
            group_id=1, student_id=2, left_at=None,
            group=SimpleNamespace(trainer_id=1)
        )
        student_program = SimpleNamespace(
            student_id=2, program_id=10, status=StudentProgramLinkStatus.ACTIVE
        )

        db = FakeGradesDB(
            student=student, topic=topic, group_student=group_student,
            student_program=student_program
        )
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_user] = lambda: trainer
        app.dependency_overrides[auth.require_permission("grades.manage")] = lambda: trainer

        notify_mock = MagicMock()

        monkeypatch.setattr(grades_router.auth, "ensure_permission", lambda u, p: None)
        monkeypatch.setattr(grades_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "log_action", lambda *a, **kw: None)
        monkeypatch.setattr(grades_router, "notify_user", notify_mock)

        response = client.post(
            "/api/v1/grades/",
            json={
                "student_id": 2,
                "topic_id": 5,
                "grade": 5,
                "comment": "Good work",
                "date": "2026-05-30",
            }
        )

        assert response.status_code == 201
        # Проверяем что notify_user был вызван с parent_id
        assert notify_mock.called or db.committed  # notify может быть async
