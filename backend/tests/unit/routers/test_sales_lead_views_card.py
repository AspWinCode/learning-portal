"""
Regрессия: GET /sales/leads/{id}/card падал с 500 (TypeError: can't compare
offset-naive and offset-aware datetimes), когда у лида без открытой задачи
задан next_contact_at (timestamptz-колонка -> aware datetime), а utcnow()
возвращает naive datetime "для совместимости со старыми полями".
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.models import Invoice, Lead, LeadActivity, LeadTask
from app.routers import sales_lead_views


def _query_mock(result):
    query = MagicMock()
    query.options.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.first.return_value = result if not isinstance(result, list) else None
    query.all.return_value = result if isinstance(result, list) else []
    return query


def _make_lead(next_contact_at):
    lead = MagicMock(spec=Lead)
    lead.id = 36
    lead.next_contact_at = next_contact_at
    lead.comment = None
    lead.parent_phone = "+79990000000"
    lead.phone = "+79990000000"
    lead.child_phone = None
    lead.email = None
    lead.questionnaire_data = None
    lead.communication_channel = None
    lead.source = None
    lead.owner = None
    lead.created_at = datetime(2026, 9, 1)
    lead.updated_at = None
    lead.tags = None
    for field in [
        "contact_name", "phone", "parent_full_name", "child_full_name", "parent_phone",
        "child_phone", "email", "city", "school_name", "school_class", "source",
        "referral_name", "comment", "pause_reason",
    ]:
        setattr(lead, field, getattr(lead, field, None) or "")
    return lead


@pytest.mark.asyncio
async def test_get_lead_card_with_aware_next_contact_at_and_no_open_task(monkeypatch):
    """Раньше падало с TypeError: can't compare offset-naive and offset-aware datetimes."""
    monkeypatch.setattr(sales_lead_views, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_lead_views, "build_lead_ai_insight", lambda lead: None)

    aware_overdue = datetime.now(timezone.utc) - timedelta(hours=2)
    lead = _make_lead(next_contact_at=aware_overdue)

    db = MagicMock()

    def query_side_effect(model, *args, **kwargs):
        if model is Lead:
            return _query_mock(lead)
        if model is LeadTask:
            return _query_mock(None)  # no open task -> falls back to lead.next_contact_at
        if model is Invoice:
            return _query_mock(None)
        if model is LeadActivity:
            return _query_mock([])
        raise AssertionError(f"Unexpected model query: {model}")

    db.query.side_effect = query_side_effect

    result = await sales_lead_views.get_lead_card(36, db=db, current_user=MagicMock())

    assert result["next_action"].state == "overdue"
    assert result["next_action"].type == "contact"
