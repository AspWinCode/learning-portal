"""
Unit-тесты новой логики воронки лидов (переработка модуля лидов):
- обязательная причина отказа и её сверка со справочником refused-reasons
- запрет перевода в 'won' в обход convert-to-student
- обязательная дата следующего контакта при переходе в 'thinking'
- arrival_channel при ручном создании лида
"""
import json
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.models import AppSetting, Lead, LeadStatus
from app.routers import sales_leads
from app.schemas.sales import LeadUpdate


def _query_mock(result):
    query = MagicMock()
    query.filter.return_value = query
    query.options.return_value = query
    query.first.return_value = result
    return query


def _make_lead(**overrides):
    lead = MagicMock(spec=Lead)
    lead.id = 1
    lead.status = LeadStatus.NEW
    lead.lost_reason = None
    lead.next_contact_at = None
    lead.referral_name = None
    lead.tags = []
    for key, value in overrides.items():
        setattr(lead, key, value)
    return lead


def _db_with(lead, refused_reasons_json=None):
    db = MagicMock()

    def query_side_effect(model):
        if model is Lead:
            return _query_mock(lead)
        if model is AppSetting:
            setting = None
            if refused_reasons_json is not None:
                setting = MagicMock()
                setting.value = refused_reasons_json
            return _query_mock(setting)
        raise AssertionError(f"Unexpected model query: {model}")

    db.query.side_effect = query_side_effect
    return db


@pytest.mark.asyncio
async def test_update_lead_refused_without_reason_returns_400(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    lead = _make_lead()
    db = _db_with(lead)

    payload = LeadUpdate(status="refused")

    with pytest.raises(HTTPException) as exc:
        await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert exc.value.status_code == 400
    assert "причин" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_lead_refused_reason_not_in_dictionary_returns_400(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    lead = _make_lead()
    db = _db_with(lead, refused_reasons_json=json.dumps(["Дорого", "Нет времени"], ensure_ascii=False))

    payload = LeadUpdate(status="refused", lost_reason="Передумал внезапно")

    with pytest.raises(HTTPException) as exc:
        await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert exc.value.status_code == 400
    assert "справочник" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_lead_refused_reason_from_dictionary_sets_refused_status(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    monkeypatch.setattr(sales_leads, "_add_activity", lambda *a, **k: None)
    monkeypatch.setattr(sales_leads, "log_action", lambda *a, **k: None)
    lead = _make_lead()
    db = _db_with(lead, refused_reasons_json=json.dumps(["Дорого", "Нет времени"], ensure_ascii=False))

    payload = LeadUpdate(status="refused", lost_reason="Дорого")

    result = await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert result.status == LeadStatus.REFUSED
    assert result.lost_reason == "Дорого"


@pytest.mark.asyncio
async def test_update_lead_refused_allows_free_text_when_other_option_present(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    monkeypatch.setattr(sales_leads, "_add_activity", lambda *a, **k: None)
    monkeypatch.setattr(sales_leads, "log_action", lambda *a, **k: None)
    lead = _make_lead()
    db = _db_with(lead, refused_reasons_json=json.dumps(["Дорого", "Другое"], ensure_ascii=False))

    payload = LeadUpdate(status="refused", lost_reason="Уезжают в другой город")

    result = await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert result.status == LeadStatus.REFUSED
    assert result.lost_reason == "Уезжают в другой город"


@pytest.mark.asyncio
async def test_update_lead_won_via_generic_update_returns_400(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    lead = _make_lead()
    db = _db_with(lead)

    payload = LeadUpdate(status="won")

    with pytest.raises(HTTPException) as exc:
        await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert exc.value.status_code == 400
    assert "convert-to-student" in exc.value.detail


@pytest.mark.asyncio
async def test_update_lead_thinking_requires_next_contact_at(monkeypatch):
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    lead = _make_lead(next_contact_at=None)
    db = _db_with(lead)

    payload = LeadUpdate(status="thinking")

    with pytest.raises(HTTPException) as exc:
        await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert exc.value.status_code == 400
    assert "следующего контакта" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_lead_thinking_with_existing_next_contact_at_ok(monkeypatch):
    from datetime import datetime

    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    monkeypatch.setattr(sales_leads, "_add_activity", lambda *a, **k: None)
    monkeypatch.setattr(sales_leads, "log_action", lambda *a, **k: None)
    lead = _make_lead(next_contact_at=datetime(2026, 9, 30))
    db = _db_with(lead)

    payload = LeadUpdate(status="thinking")

    result = await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert result.status == LeadStatus.THINKING


@pytest.mark.asyncio
async def test_update_lead_old_lost_status_still_valid_with_reason(monkeypatch):
    """Архивный переход в status=lost (обратная совместимость) по-прежнему требует причину,
    но остаётся допустимым значением enum."""
    monkeypatch.setattr(sales_leads, "_require_owner_or_admin", lambda lead, user: None)
    monkeypatch.setattr(sales_leads, "sync_lead_person", lambda db, lead: None)
    monkeypatch.setattr(sales_leads, "_add_activity", lambda *a, **k: None)
    monkeypatch.setattr(sales_leads, "log_action", lambda *a, **k: None)
    lead = _make_lead()
    db = _db_with(lead)

    payload = LeadUpdate(status="lost", lost_reason="Архивная причина")

    result = await sales_leads.update_lead(1, payload, db=db, current_user=MagicMock())

    assert result.status == LeadStatus.LOST
