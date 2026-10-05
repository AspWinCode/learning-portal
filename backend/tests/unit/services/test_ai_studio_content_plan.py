from datetime import date

import pytest

from app.services.ai_studio import content_plan


def test_coerce_date_parses_iso_string():
    assert content_plan._coerce_date("2026-11-05") == date(2026, 11, 5)


def test_coerce_date_rejects_garbage():
    assert content_plan._coerce_date("not-a-date") is None
    assert content_plan._coerce_date(None) is None
    assert content_plan._coerce_date("") is None


def test_parse_plan_items_requires_dict():
    with pytest.raises(ValueError, match="не JSON"):
        content_plan._parse_plan_items(None)
    with pytest.raises(ValueError, match="не JSON"):
        content_plan._parse_plan_items("oops")


def test_parse_plan_items_requires_nonempty_items_list():
    with pytest.raises(ValueError, match="items"):
        content_plan._parse_plan_items({"items": []})
    with pytest.raises(ValueError, match="items"):
        content_plan._parse_plan_items({})


def test_parse_plan_items_skips_rows_without_topic():
    parsed = content_plan._parse_plan_items(
        {"items": [{"date": "2026-11-01"}, {"topic": "Турнир по Python", "channel": "vk", "goal": "набор"}]}
    )
    assert len(parsed) == 1
    assert parsed[0]["title"] == "Турнир по Python"
    assert parsed[0]["channel"] == "vk"
    assert parsed[0]["content_type"] == "набор"


def test_parse_plan_items_all_rows_invalid_raises():
    with pytest.raises(ValueError, match="прошёл валидацию"):
        content_plan._parse_plan_items({"items": [{"channel": "vk"}, {"date": "2026-11-01"}]})


@pytest.mark.asyncio
async def test_generate_items_requires_ai_gateway_configured(monkeypatch):
    from app.services import ai_gateway

    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose="text": False)
    with pytest.raises(ValueError, match="AI Tunnel не настроен"):
        await content_plan.generate_items(
            db=None,
            user=object(),
            workspace=None,
            plan=None,
            count=5,
            channels=["vk"],
        )
