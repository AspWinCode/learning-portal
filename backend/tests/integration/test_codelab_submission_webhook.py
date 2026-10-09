"""POST /api/v1/codelab/courses/webhook — event=project_submitted/
project_resubmitted notifies the student's trainer(s). Real HTTP (signed,
no auth token — this endpoint is system-to-system) against a real DB.
"""
import hashlib
import hmac
import json
import uuid

import pytest
from fastapi.testclient import TestClient

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
def trainer_user(db):
    from app.models import ActionLog, User, UserRole

    user = User(
        email=f"test_webhook_trainer_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Webhook Trainer",
        role=UserRole.TRAINER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.query(ActionLog).filter(ActionLog.user_id == user.id).delete(synchronize_session=False)
    db.delete(db.get(User, user.id))
    db.commit()


@pytest.fixture
def group(db, trainer_user):
    from app.models import Group, GroupStatus

    g = Group(name=f"Webhook Group {uuid.uuid4().hex[:6]}", trainer_id=trainer_user.id, status=GroupStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    yield g
    db.delete(db.get(Group, g.id))
    db.commit()


@pytest.fixture
def student_in_group(db, group):
    from app.models import GroupStudent, Student

    s = Student(full_name=f"Webhook Student {uuid.uuid4().hex[:6]}")
    db.add(s)
    db.commit()
    db.refresh(s)
    gs = GroupStudent(group_id=group.id, student_id=s.id)
    db.add(gs)
    db.commit()
    yield s
    db.query(GroupStudent).filter(GroupStudent.id == gs.id).delete(synchronize_session=False)
    db.delete(db.get(Student, s.id))
    db.commit()


def _signed_post(client, body: dict):
    from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

    raw = json.dumps(body).encode("utf-8")
    sig = hmac.new(SSO_KODEX_SHARED_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return client.post(
        "/api/v1/codelab/courses/webhook",
        content=raw,
        headers={"Content-Type": "application/json", "X-LP-Signature": sig},
    )


def _cleanup_queue(db, dedupe_key_prefix: str):
    from app.models import CommunicationQueue

    db.query(CommunicationQueue).filter(CommunicationQueue.dedupe_key.like(f"{dedupe_key_prefix}%")).delete(
        synchronize_session=False
    )
    db.commit()


class TestSubmissionWebhook:
    def test_rejects_bad_signature(self, db):
        from app.main import app

        client = TestClient(app)
        body = json.dumps({"event": "project_submitted", "submission": {}}).encode("utf-8")
        r = client.post(
            "/api/v1/codelab/courses/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-LP-Signature": "bad"},
        )
        assert r.status_code == 401

    def test_notifies_trainer_on_first_submission(self, db, trainer_user, student_in_group):
        from app.main import app
        from app.models import CommunicationQueue

        client = TestClient(app)
        submission_id = 900001
        body = {
            "event": "project_submitted",
            "submission": {
                "id": submission_id,
                "course_id": 1,
                "item_id": 1,
                "attempt_number": 1,
                "submitted_at": "2026-10-09T10:00:00Z",
                "student_external_ref": f"lp-student-{student_in_group.id}",
            },
        }
        try:
            r = _signed_post(client, body)
            assert r.status_code == 200

            dedupe_key = f"codelab-submission:{submission_id}:1:{trainer_user.id}"
            row = db.query(CommunicationQueue).filter(CommunicationQueue.dedupe_key == dedupe_key).first()
            assert row is not None
            assert row.recipient_type == "user"
            assert row.recipient_id == trainer_user.id
        finally:
            _cleanup_queue(db, f"codelab-submission:{submission_id}:")

    def test_unknown_student_ref_does_not_500(self, db):
        from app.main import app

        client = TestClient(app)
        body = {
            "event": "project_submitted",
            "submission": {
                "id": 900002,
                "course_id": 1,
                "item_id": 1,
                "attempt_number": 1,
                "submitted_at": None,
                "student_external_ref": "lp-student-999999999",
            },
        }
        r = _signed_post(client, body)
        assert r.status_code == 200

    def test_unknown_event_is_accepted_and_ignored(self, db):
        from app.main import app

        client = TestClient(app)
        r = _signed_post(client, {"event": "something_else"})
        assert r.status_code == 200
