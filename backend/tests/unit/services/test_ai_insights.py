from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models import LeadStatus
from app.services.ai_insights import build_lead_ai_insight, build_owner_ai_insights


def test_build_lead_ai_insight_marks_fresh_invoice_lead_as_hot() -> None:
    now = datetime(2026, 5, 20, 12, 0, 0)
    lead = SimpleNamespace(
        status=LeadStatus.INVOICE_SENT,
        last_contact_at=now - timedelta(days=1),
        created_at=now - timedelta(days=7),
        next_contact_at=now + timedelta(hours=3),
        no_answer_attempt=0,
        questionnaire_filled=True,
    )

    insight = build_lead_ai_insight(lead, now=now)

    assert insight["stage"] in {"hot", "warm"}
    assert insight["score"] >= 70
    assert "инвойс" in insight["best_next_action"].lower()


def test_build_lead_ai_insight_marks_stale_no_answer_lead_as_cold() -> None:
    now = datetime(2026, 5, 20, 12, 0, 0)
    lead = SimpleNamespace(
        status=LeadStatus.NO_ANSWER,
        last_contact_at=now - timedelta(days=25),
        created_at=now - timedelta(days=30),
        next_contact_at=None,
        no_answer_attempt=3,
        questionnaire_filled=False,
    )

    insight = build_lead_ai_insight(lead, now=now)

    assert insight["stage"] == "cold"
    assert insight["score"] < 40
    assert insight["reasons"]


def test_build_owner_ai_insights_detects_cashflow_drop() -> None:
    summary = {
        "payments_last_14_days": [
            {"label": "01.05", "value": 100000},
            {"label": "02.05", "value": 90000},
            {"label": "03.05", "value": 110000},
            {"label": "04.05", "value": 95000},
            {"label": "05.05", "value": 15000},
        ],
        "new_leads_month": 20,
        "won_leads_month": 2,
        "makeups_waiting_parent": 5,
        "makeups_pending_total": 8,
    }

    insights = build_owner_ai_insights(summary)

    assert len(insights) >= 2
    assert any(item["kind"] == "cashflow" for item in insights)
