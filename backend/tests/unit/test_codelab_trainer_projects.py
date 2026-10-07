import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.models import UserRole
from app.routers import codelab


class _MembershipQuery:
    def join(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def __iter__(self):
        return iter([(101,), (103,)])


class _MembershipDb:
    def query(self, *_args):
        return _MembershipQuery()


def test_trainer_can_load_course_picker_and_published_tree(monkeypatch):
    app = FastAPI()
    app.include_router(codelab.router, prefix="/api/v1/codelab")
    trainer = SimpleNamespace(id=7, effective_role=UserRole.TRAINER)
    app.dependency_overrides[codelab._access] = lambda: trainer
    monkeypatch.setattr(codelab.cl, "list_courses", _async_result([{"id": 4, "title": "Python", "status": "published"}]))
    monkeypatch.setattr(codelab.cl, "get_course_tree", _async_result([{"id": 12, "type": "project", "title": "Проект"}]))

    with TestClient(app) as client:
        courses = client.get("/api/v1/codelab/admin/courses")
        tree = client.get("/api/v1/codelab/admin/courses/4/tree")

    assert courses.status_code == 200
    assert courses.json()[0]["title"] == "Python"
    assert tree.status_code == 200
    assert tree.json()[0]["type"] == "project"


def test_trainer_project_roster_and_direct_review_access_are_group_scoped(monkeypatch):
    trainer = SimpleNamespace(id=7)
    rows = [
        {"id": 1, "student_external_ref": "lp-student-101"},
        {"id": 2, "student_external_ref": "lp-student-102"},
        {"id": 3, "student_external_ref": "lp-student-103"},
        {"id": 4, "student_external_ref": "unexpected-format"},
    ]
    monkeypatch.setattr(codelab.auth, "resolve_effective_role", lambda _user: UserRole.TRAINER)
    monkeypatch.setattr(codelab.cl, "list_project_submissions", _async_result(rows))
    db = _MembershipDb()

    visible = asyncio.run(codelab.admin_list_project_submissions(4, 12, trainer, db))
    assert [row["id"] for row in visible] == [1, 3]

    allowed = asyncio.run(codelab._get_and_authorize_project_row(trainer, db, 4, 12, 1))
    assert allowed["student_external_ref"] == "lp-student-101"
    with pytest.raises(HTTPException) as denied:
        asyncio.run(codelab._get_and_authorize_project_row(trainer, db, 4, 12, 2))
    assert denied.value.status_code == 403


def _async_result(value):
    async def result(*_args, **_kwargs):
        return value

    return result
