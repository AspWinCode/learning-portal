"""
Unit-тесты сервиса lead_post_visit (ТЗ: обновление стадии воронки «Дожать на обучение»).
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.services.lead_post_visit import (
    update_lead_post_visit_stage,
    UpdatePostVisitStageResult,
)
from app.models import LeadStatus


def _make_lead(lead_id=1):
    lead = MagicMock()
    lead.id = lead_id
    lead.post_visit_stage = None
    lead.post_visit_review = None
    lead.post_visit_project_date = None
    lead.lost_reason = None
    lead.status = LeadStatus.NEW
    lead.status_option_id = None
    return lead


# ─────────────────────── Базовые проверки ───────────────────────


def test_update_post_visit_lead_not_found():
    """Лид не найден → ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Lead not found"):
        update_lead_post_visit_stage(db, 999, stage="new")


def test_update_post_visit_sets_stage():
    """Стадия записывается в lead.post_visit_stage."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    result = update_lead_post_visit_stage(db, 1, stage="project_offer")

    assert lead.post_visit_stage == "project_offer"
    assert isinstance(result, UpdatePostVisitStageResult)
    assert result.lead is lead


# ─────────────────────── project_agreed ───────────────────────


def test_update_post_visit_project_agreed_no_review():
    """project_agreed без отзыва → ValueError."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    with pytest.raises(ValueError, match="отзыв по проекту"):
        update_lead_post_visit_stage(db, 1, stage="project_agreed", review="", project_date=datetime.now())


def test_update_post_visit_project_agreed_no_date():
    """project_agreed без даты → ValueError."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    with pytest.raises(ValueError, match="дату проведения"):
        update_lead_post_visit_stage(db, 1, stage="project_agreed", review="Хороший проект", project_date=None)


def test_update_post_visit_project_agreed_success():
    """project_agreed с отзывом и датой → поля установлены, need_auto_task=False."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead
    project_date = datetime(2025, 4, 1)

    result = update_lead_post_visit_stage(
        db, 1, stage="project_agreed", review="Отлично", project_date=project_date
    )

    assert lead.post_visit_review == "Отлично"
    assert lead.post_visit_project_date == project_date
    assert result.need_auto_task is False


# ─────────────────────── course_agreed ───────────────────────


def test_update_post_visit_course_agreed_no_review():
    """course_agreed без отзыва → ValueError."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    with pytest.raises(ValueError, match="отзыв перед записью"):
        update_lead_post_visit_stage(db, 1, stage="course_agreed", review="")


def test_update_post_visit_course_agreed_success():
    """course_agreed с отзывом → статус INVOICE_SENT, need_auto_task=True."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    result = update_lead_post_visit_stage(db, 1, stage="course_agreed", review="Хочет поступить")

    assert lead.post_visit_review == "Хочет поступить"
    assert lead.status == LeadStatus.INVOICE_SENT
    assert result.need_auto_task is True


def test_update_post_visit_course_agreed_calls_status_callback():
    """course_agreed вызывает get_default_lead_status_option_id и присваивает id."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    callback = MagicMock(return_value=42)
    update_lead_post_visit_stage(
        db, 1, stage="course_agreed", review="Отзыв",
        get_default_lead_status_option_id=callback,
    )

    callback.assert_called_once_with(db, LeadStatus.INVOICE_SENT)
    assert lead.status_option_id == 42


# ─────────────────────── declined ───────────────────────


def test_update_post_visit_declined_no_reason():
    """declined без причины → ValueError."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    with pytest.raises(ValueError, match="причину отказа"):
        update_lead_post_visit_stage(db, 1, stage="declined", decline_reason="")


def test_update_post_visit_declined_success():
    """declined с причиной → статус LOST, lost_reason заполнен."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    result = update_lead_post_visit_stage(
        db, 1, stage="declined", decline_reason="Дорого"
    )

    assert lead.lost_reason == "Дорого"
    assert lead.status == LeadStatus.LOST
    assert result.need_auto_task is False


# ─────────────────────── Простые стадии ───────────────────────


@pytest.mark.parametrize("stage", ["new", "project_offer", "course_offer"])
def test_update_post_visit_simple_stages_no_error(stage):
    """Простые стадии (new/project_offer/course_offer) → без ошибок."""
    db = MagicMock()
    lead = _make_lead()
    db.query.return_value.filter.return_value.first.return_value = lead

    result = update_lead_post_visit_stage(db, 1, stage=stage)

    assert lead.post_visit_stage == stage
    assert result.need_auto_task is False
