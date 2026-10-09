from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database import get_db
from app.routers.lego import LegoQuestionnaireIn, router, submit_questionnaire


def _payload(**overrides):
    return LegoQuestionnaireIn(**{
        "full_name": " Child Name ",
        "birth_date": "2018-05-12",
        "parent_name": " Parent Name ",
        "parent_phone": "8 (999) 123-45-67",
        "experience": "home",
        "consent": True,
        **overrides,
    })


@pytest.mark.parametrize("overrides", [
    {"full_name": "   "}, {"parent_phone": "123"}, {"secondary_phone": "123"},
    {"birth_date": date.today() + timedelta(days=1)}, {"consent": False},
    {"experience": "invalid"},
])
def test_questionnaire_rejects_invalid_data(overrides):
    with pytest.raises(ValidationError):
        _payload(**overrides)


def test_questionnaire_creates_only_lego_student_without_payment_obligation():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with patch("app.routers.lego.log_action"):
        result = submit_questionnaire(_payload(school="School", preferred_schedule="Saturday"), db)
    student = db.add.call_args.args[0]
    assert student.__tablename__ == "lego_students"
    assert student.full_name == "Child Name"
    assert student.parent_name == "Parent Name"
    assert student.parent_phone == "+79991234567"
    assert student.payment_active is False
    assert "School" in student.comment
    assert "Saturday" in student.comment
    assert result == {"ok": True}
    db.commit.assert_called_once()


def test_repeated_questionnaire_does_not_change_existing_student():
    db = MagicMock()
    assert submit_questionnaire(_payload(), db) == {"ok": True}
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_public_questionnaire_accepts_submission_without_login():
    app = FastAPI()
    app.include_router(router, prefix="/lego")
    db = MagicMock()
    app.dependency_overrides[get_db] = lambda: db
    response = TestClient(app).post("/lego/public/questionnaire", json=_payload().model_dump(mode="json"))
    assert response.status_code == 200
    assert response.json() == {"ok": True}
