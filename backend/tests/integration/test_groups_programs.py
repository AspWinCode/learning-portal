"""
Интеграционные тесты для модулей Groups и Programs.

Покрывают критические workflow:
1. Добавление студента в группу — авто-назначение программ
2. Назначение/удаление программ у группы
3. Валидация ACTIVE статуса программы в groups и programs роутерах
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock, call

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from app.models import (
    GroupStatus,
    ProgramStatus,
    StudentStatus,
    StudentProgramLinkStatus,
    GroupProgram,
    GroupStudent,
    StudentProgram,
)
from app.database import get_db
from app.routers import groups as groups_router
from app.routers import programs as programs_router


# ---------------------------------------------------------------------------
# Вспомогательные fake-объекты
# ---------------------------------------------------------------------------

def _admin_user():
    return SimpleNamespace(id=1, role="admin")


def _make_program(program_id: int, status: ProgramStatus = ProgramStatus.ACTIVE):
    p = SimpleNamespace(id=program_id, name=f"Program {program_id}", status=status)
    return p


def _make_student(student_id: int, status: StudentStatus = StudentStatus.ACTIVE):
    return SimpleNamespace(
        id=student_id,
        full_name=f"Student {student_id}",
        status=status,
        parent_id=None,
    )


def _make_group(group_id: int, programs=None, group_students=None):
    return SimpleNamespace(
        id=group_id,
        name=f"Group {group_id}",
        status=GroupStatus.ACTIVE,
        programs=programs or [],
        group_students=group_students or [],
    )


class FakeQuery:
    """Мок-запрос к БД: возвращает заранее заданный результат."""

    def __init__(self, result=None):
        self._result = result
        self._filters = []

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result

    def distinct(self):
        return self

    def join(self, *args, **kwargs):
        return self

    def all(self):
        if self._result is None:
            return []
        if isinstance(self._result, list):
            return self._result
        return [self._result]

    def count(self):
        return 0

    def offset(self, n):
        return self

    def limit(self, n):
        return self

    def order_by(self, *args):
        return self


class FakeGroupsDB:
    """Мок БД для тестов модуля groups."""

    def __init__(self, *, group=None, student=None, existing_link=None, existing_group_student=None,
                 student_program=None, group_program=None, program=None):
        self._group = group
        self._student = student
        self._existing_link = existing_link
        self._existing_group_student = existing_group_student
        self._student_program = student_program
        self._group_program = group_program
        self._program = program
        self.added = []
        self.deleted = []
        self.committed = False
        self.flushed = False

    def query(self, model):
        from app.models import Group, Student, GroupStudent, StudentProgram, GroupProgram, Program
        if model is Group:
            return FakeQuery(self._group)
        if model is Student:
            return FakeQuery(self._student)
        if model is GroupStudent:
            return FakeQuery(self._existing_group_student)
        if model is StudentProgram:
            return FakeQuery(self._student_program)
        if model is GroupProgram:
            return FakeQuery(self._group_program)
        if model is Program:
            return FakeQuery(self._program)
        return FakeQuery(None)

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def flush(self):
        self.flushed = True

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        if not getattr(obj, "id", None):
            obj.id = 999


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides = {}
    yield
    app.dependency_overrides = {}


def _override_auth(admin_user=None):
    user = admin_user or _admin_user()
    app.dependency_overrides[auth.get_current_active_user] = lambda: user
    app.dependency_overrides[auth.require_permission("groups.manage")] = lambda: user
    app.dependency_overrides[auth.require_permission("programs.manage")] = lambda: user


# ---------------------------------------------------------------------------
# Тесты: добавление студента в группу
# ---------------------------------------------------------------------------

class TestAddStudentToGroup:

    def test_adds_group_student_and_assigns_program(self, client: TestClient, monkeypatch):
        """Студент добавляется в группу → StudentProgram создаётся автоматически."""
        program = _make_program(10)
        group = _make_group(1, programs=[program])
        student = _make_student(2)

        db = FakeGroupsDB(group=group, student=student, existing_group_student=None, student_program=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)

        response = client.post("/api/v1/groups/1/students/2")

        assert response.status_code == 200
        assert response.json()["message"] == "Student added to group"

        types_added = [type(obj).__name__ for obj in db.added]
        assert "GroupStudent" in types_added
        assert "StudentProgram" in types_added
        assert db.committed is True

    def test_assigns_only_active_programs(self, client: TestClient, monkeypatch):
        """Архивированная программа группы НЕ назначается студенту."""
        active_prog = _make_program(10, ProgramStatus.ACTIVE)
        archived_prog = _make_program(11, ProgramStatus.ARCHIVED)
        group = _make_group(1, programs=[active_prog, archived_prog])
        student = _make_student(2)

        db = FakeGroupsDB(group=group, student=student)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)

        client.post("/api/v1/groups/1/students/2")

        student_programs = [obj for obj in db.added if isinstance(obj, StudentProgram)]
        assert len(student_programs) == 1
        assert student_programs[0].program_id == 10  # только ACTIVE

    def test_reactivates_archived_student_program(self, client: TestClient, monkeypatch):
        """Если StudentProgram уже есть с ARCHIVED статусом — реактивируется, не дублируется."""
        program = _make_program(10)
        group = _make_group(1, programs=[program])
        student = _make_student(2)

        existing_sp = SimpleNamespace(
            student_id=2, program_id=10, status=StudentProgramLinkStatus.ARCHIVED
        )

        db = FakeGroupsDB(group=group, student=student, student_program=existing_sp)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)

        client.post("/api/v1/groups/1/students/2")

        # Реактивация: статус обновился, новый объект НЕ добавлен
        assert existing_sp.status == StudentProgramLinkStatus.ACTIVE
        new_sps = [obj for obj in db.added if isinstance(obj, StudentProgram)]
        assert len(new_sps) == 0

    def test_returns_404_if_group_not_found(self, client: TestClient, monkeypatch):
        db = FakeGroupsDB(group=None, student=_make_student(2))
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/999/students/2")
        assert response.status_code == 404

    def test_returns_404_if_student_not_found(self, client: TestClient, monkeypatch):
        db = FakeGroupsDB(group=_make_group(1), student=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/1/students/999")
        assert response.status_code == 404

    def test_returns_400_if_student_not_active(self, client: TestClient, monkeypatch):
        """Архивированного студента нельзя добавить в группу."""
        group = _make_group(1)
        student = _make_student(2, StudentStatus.ARCHIVED)

        db = FakeGroupsDB(group=group, student=student)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/1/students/2")
        assert response.status_code == 400
        assert "not active" in response.json()["detail"]

    def test_returns_400_if_student_already_in_group(self, client: TestClient, monkeypatch):
        """Уже добавленного студента нельзя добавить повторно."""
        group = _make_group(1)
        student = _make_student(2)
        existing_gs = SimpleNamespace(group_id=1, student_id=2, left_at=None)

        db = FakeGroupsDB(group=group, student=student, existing_group_student=existing_gs)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/1/students/2")
        assert response.status_code == 400
        assert "already in group" in response.json()["detail"]

    def test_does_not_assign_programs_if_group_has_none(self, client: TestClient, monkeypatch):
        """Если у группы нет программ — GroupStudent создаётся, StudentProgram — нет."""
        group = _make_group(1, programs=[])
        student = _make_student(2)

        db = FakeGroupsDB(group=group, student=student)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_student_activity", lambda *a, **kw: None)
        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)

        response = client.post("/api/v1/groups/1/students/2")
        assert response.status_code == 200

        new_sps = [obj for obj in db.added if isinstance(obj, StudentProgram)]
        assert len(new_sps) == 0


# ---------------------------------------------------------------------------
# Тесты: назначение программы группе (новый endpoint)
# ---------------------------------------------------------------------------

class TestAssignProgramToGroup:

    def test_assigns_program_to_group_and_students(self, client: TestClient, monkeypatch):
        """POST /groups/{gid}/programs/{pid} — создаёт GroupProgram и StudentProgram для студентов."""
        program = _make_program(10)
        student = _make_student(2)
        gs = SimpleNamespace(student=student, student_id=2, left_at=None)
        group = _make_group(1, group_students=[gs])

        db = FakeGroupsDB(group=group, program=program, group_program=None, student_program=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)
        async def _noop(*a, **kw): pass
        monkeypatch.setattr(groups_router, "invalidate_namespace", _noop)

        response = client.post("/api/v1/groups/1/programs/10")

        assert response.status_code == 200
        assert "assigned" in response.json()["message"]

        types_added = [type(obj).__name__ for obj in db.added]
        assert "GroupProgram" in types_added
        assert "StudentProgram" in types_added
        assert db.committed is True

    def test_rejects_archived_program(self, client: TestClient, monkeypatch):
        """Нельзя назначить архивированную программу группе."""
        program = _make_program(10, ProgramStatus.ARCHIVED)
        group = _make_group(1)

        db = FakeGroupsDB(group=group, program=program)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/1/programs/10")

        assert response.status_code == 400
        assert "archived" in response.json()["detail"].lower()
        assert db.committed is False

    def test_idempotent_if_already_assigned(self, client: TestClient, monkeypatch):
        """Повторный вызов возвращает 200 без дублирования."""
        program = _make_program(10)
        group = _make_group(1)
        existing_gp = SimpleNamespace(group_id=1, program_id=10)

        db = FakeGroupsDB(group=group, program=program, group_program=existing_gp)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)
        async def _noop(*a, **kw): pass
        monkeypatch.setattr(groups_router, "invalidate_namespace", _noop)

        response = client.post("/api/v1/groups/1/programs/10")

        assert response.status_code == 200
        assert "already assigned" in response.json()["message"]
        # Никаких новых объектов не добавлено
        assert len(db.added) == 0

    def test_returns_404_if_group_not_found(self, client: TestClient, monkeypatch):
        program = _make_program(10)
        db = FakeGroupsDB(group=None, program=program)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/999/programs/10")
        assert response.status_code == 404

    def test_returns_404_if_program_not_found(self, client: TestClient, monkeypatch):
        group = _make_group(1)
        db = FakeGroupsDB(group=group, program=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/groups/1/programs/999")
        assert response.status_code == 404

    def test_skips_archived_students(self, client: TestClient, monkeypatch):
        """Архивированные студенты пропускаются при авто-назначении программы."""
        program = _make_program(10)
        active_student = _make_student(2, StudentStatus.ACTIVE)
        archived_student = _make_student(3, StudentStatus.ARCHIVED)
        gs1 = SimpleNamespace(student=active_student, student_id=2, left_at=None)
        gs2 = SimpleNamespace(student=archived_student, student_id=3, left_at=None)
        group = _make_group(1, group_students=[gs1, gs2])

        db = FakeGroupsDB(group=group, program=program, group_program=None, student_program=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)
        async def _noop(*a, **kw): pass
        monkeypatch.setattr(groups_router, "invalidate_namespace", _noop)

        client.post("/api/v1/groups/1/programs/10")

        student_programs = [obj for obj in db.added if isinstance(obj, StudentProgram)]
        assert len(student_programs) == 1
        assert student_programs[0].student_id == 2  # только active


# ---------------------------------------------------------------------------
# Тесты: удаление программы из группы (новый endpoint)
# ---------------------------------------------------------------------------

class TestRemoveProgramFromGroup:

    def test_removes_group_program(self, client: TestClient, monkeypatch):
        """DELETE /groups/{gid}/programs/{pid} — удаляет GroupProgram."""
        existing_gp = SimpleNamespace(group_id=1, program_id=10)
        db = FakeGroupsDB(group_program=existing_gp)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(groups_router, "log_action", lambda *a, **kw: None)
        async def _noop(*a, **kw): pass
        monkeypatch.setattr(groups_router, "invalidate_namespace", _noop)

        response = client.delete("/api/v1/groups/1/programs/10")

        assert response.status_code == 200
        assert "removed" in response.json()["message"]
        assert existing_gp in db.deleted
        assert db.committed is True

    def test_returns_404_if_not_assigned(self, client: TestClient, monkeypatch):
        """Удаление программы которая не назначена → 404."""
        db = FakeGroupsDB(group_program=None)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.delete("/api/v1/groups/1/programs/10")
        assert response.status_code == 404
        assert "not assigned" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Тесты: валидация ACTIVE статуса в Programs роутере
# ---------------------------------------------------------------------------

class TestProgramsAssignToStudent:

    def _make_programs_db(self, program=None, student=None, existing_sp=None):
        from app.models import StudentProgram, ProgramTrainer
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        def _query_side_effect(model):
            from app.models import Program, Student, StudentProgram as SP, ProgramTrainer as PT, Group
            q = MagicMock()
            q.filter.return_value = q
            q.distinct.return_value = q

            if model is programs_router.Program:
                q.first.return_value = program
            elif model is programs_router.Student:
                q.first.return_value = student
            elif model is SP:
                q.first.return_value = existing_sp
            elif model is PT:
                q.first.return_value = None
            elif model is Group:
                q.all.return_value = []
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = _query_side_effect
        return db

    def test_rejects_archived_program_assign_to_student(self, client: TestClient, monkeypatch):
        """Нельзя назначить архивированную программу студенту."""
        program = _make_program(10, ProgramStatus.ARCHIVED)
        student = _make_student(2)

        db = self._make_programs_db(program=program, student=student)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/programs/10/assign-to-student/2")

        assert response.status_code == 400
        assert "archived" in response.json()["detail"].lower()

    def test_allows_active_program_assign_to_student(self, client: TestClient, monkeypatch):
        """ACTIVE программу можно назначить студенту."""
        program = _make_program(10, ProgramStatus.ACTIVE)
        student = _make_student(2)

        db = self._make_programs_db(program=program, student=student)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(programs_router, "log_action", lambda *a, **kw: None)

        response = client.post("/api/v1/programs/10/assign-to-student/2")

        assert response.status_code == 200
        assert "added" in response.json()["message"]

    def test_idempotent_active_program_assign(self, client: TestClient, monkeypatch):
        """Повторное назначение ACTIVE программы возвращает 200 без ошибки."""
        program = _make_program(10, ProgramStatus.ACTIVE)
        student = _make_student(2)
        existing_sp = SimpleNamespace(student_id=2, program_id=10, status=StudentProgramLinkStatus.ACTIVE)

        db = self._make_programs_db(program=program, student=student, existing_sp=existing_sp)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        response = client.post("/api/v1/programs/10/assign-to-student/2")

        assert response.status_code == 200
        assert "already assigned" in response.json()["message"]

    def test_reactivates_archived_student_program(self, client: TestClient, monkeypatch):
        """Если программа была ARCHIVED для студента — реактивируется."""
        program = _make_program(10, ProgramStatus.ACTIVE)
        student = _make_student(2)
        existing_sp = SimpleNamespace(student_id=2, program_id=10, status=StudentProgramLinkStatus.ARCHIVED)

        db = self._make_programs_db(program=program, student=student, existing_sp=existing_sp)
        app.dependency_overrides[get_db] = lambda: db
        _override_auth()

        monkeypatch.setattr(programs_router, "log_action", lambda *a, **kw: None)

        response = client.post("/api/v1/programs/10/assign-to-student/2")

        assert response.status_code == 200
        assert "reactivated" in response.json()["message"]
        assert existing_sp.status == StudentProgramLinkStatus.ACTIVE
