import pytest
from types import SimpleNamespace

from app.models import UserRole
from app.routers import codelab
from app.schemas.codelab import CodelabWebhookSubmission


@pytest.mark.asyncio
async def test_trainer_feed_contains_latest_task_and_project_only_from_active_roster(monkeypatch):
    user = type("UserStub", (), {"id": 7})()
    course = {"id": 11, "title": "Python"}

    monkeypatch.setattr(codelab.auth, "resolve_effective_role", lambda _: UserRole.TRAINER)
    monkeypatch.setattr(codelab, "_trainer_student_context", lambda _db, _trainer_id: {42: {"group_id": 3, "group_name": "Группа A"}})
    monkeypatch.setattr(codelab.cl, "list_courses", lambda _user: _async_value([course]))
    monkeypatch.setattr(codelab.cl, "list_course_submissions", lambda _user, _course_id: _async_value([
        {"submission_id": 101, "student_external_ref": "lp-student-42", "student_full_name": "Анна", "item_id": 1, "item_title": "Цикл", "attempt_number": 1, "verdict": "Wrong Answer", "created_at": "2026-10-10"},
        {"submission_id": 102, "student_external_ref": "lp-student-42", "student_full_name": "Анна", "item_id": 1, "item_title": "Цикл", "attempt_number": 2, "verdict": "Accepted", "created_at": "2026-10-11", "code": "print(1)"},
        {"submission_id": 999, "student_external_ref": "lp-student-999", "item_id": 1, "attempt_number": 1},
    ]))
    monkeypatch.setattr(codelab.cl, "get_course_tree", lambda _user, _course_id: _async_value([{"type": "project", "id": 5, "title": "Проект"}]))
    monkeypatch.setattr(codelab.cl, "list_project_submissions", lambda _user, _course_id, _item_id: _async_value([
        {"id": 201, "student_external_ref": "lp-student-42", "student_full_name": "Анна", "attempt_number": 1, "status": "submitted", "submitted_at": "2026-10-12"},
    ]))

    rows = await codelab.list_trainer_submissions(user, object())

    assert {(row["submission_type"], row["submission_id"]) for row in rows} == {("task", 102), ("project", 201)}
    assert rows[0]["group_name"] == "Группа A"
    assert rows[0]["student_external_ref"] == "lp-student-42"


async def _async_value(value):
    return value


def test_submission_webhook_notification_failure_is_best_effort(monkeypatch, caplog):
    class Query:
        def filter(self, *_args, **_kwargs):
            return self

        def first(self):
            return SimpleNamespace(full_name="Анна")

    class Db:
        def query(self, *_args, **_kwargs):
            return Query()

    trainer = SimpleNamespace(id=9)
    monkeypatch.setattr(codelab, "_trainers_for_student", lambda _db, _student_id: [trainer])

    def fail_send(*_args, **_kwargs):
        raise RuntimeError("mail service is down")

    monkeypatch.setattr(codelab.CommunicationService, "send", fail_send)
    submission = CodelabWebhookSubmission(
        id=300, course_id=11, item_id=5, attempt_number=2,
        submitted_at="2026-10-12T10:00:00Z", student_external_ref="lp-student-42",
    )

    with caplog.at_level("ERROR"):
        codelab._notify_trainers_of_submission(Db(), "project_resubmitted", submission)

    assert "notify failed" in caplog.text
    assert "submission_id=300" in caplog.text
    assert "trainer_id=9" in caplog.text
