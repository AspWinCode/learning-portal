import pytest

from app.services import ai_gateway
from app.services.academy_ai import orchestrator as orch


class _User:
    def __init__(self, role, permissions):
        self.id = 1
        self.role = role
        self.custom_role = None
        self.custom_role_id = None
        self.role_permissions = permissions
        self.extra_roles = []


def _owner():
    return _User("owner", ["*"])


def test_select_lms_tools_matches_keywords():
    tools = orch._select_lms_tools("Посчитай рентабельность и выручку за квартал", _owner())
    assert tools == ["finance_summary"]


def test_select_lms_tools_multiple_capped_at_three():
    msg = "выручка, школы-партнёры, ученики, группы, воронка продаж, отзывы"
    tools = orch._select_lms_tools(msg, _owner())
    assert len(tools) == 3


def test_select_lms_tools_respects_permissions():
    # seo_manager: дефолтные права не пересекаются с LMS-инструментами
    user = _User("seo_manager", ["finance.access"])  # нет academy_ai.finance_context
    assert orch._select_lms_tools("какая выручка?", user) == []


def test_select_lms_tools_none_on_generic_question():
    assert orch._select_lms_tools("как в принципе выстроить систему мотивации?", _owner()) == []


def test_degraded_answer_lists_context():
    text = orch._degraded_answer(
        {"expertise": [{"title": "Мат. образовательного бизнеса"}], "kb": [{"title": "Прайс 2026"}], "lms": ["finance_summary"]}
    )
    assert "методика" in text and "Прайс 2026" in text and "finance_summary" in text


def test_degraded_answer_empty():
    assert "не найдено" in orch._degraded_answer({"expertise": [], "kb": [], "lms": []})


def test_degraded_answer_mentions_profile_when_used():
    text = orch._degraded_answer({"expertise": [], "kb": [], "lms": [], "profile": True})
    assert "профиль" in text


@pytest.mark.asyncio
async def test_select_lms_tools_llm_falls_back_to_keywords_when_not_configured(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose="text": False)
    tools = await orch._select_lms_tools_llm("какая у нас выручка?", _owner())
    assert tools == ["finance_summary"]


@pytest.mark.asyncio
async def test_select_lms_tools_llm_uses_model_choice(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose="text": True)

    class _Result:
        ok = True
        text = '{"tools": ["finance_summary", "sales_funnel", "unknown_tool"]}'

        def json_object(self):
            return {"tools": ["finance_summary", "sales_funnel", "unknown_tool"]}

    async def _fake_complete_text(**kwargs):
        return _Result()

    monkeypatch.setattr(ai_gateway, "complete_text", _fake_complete_text)
    tools = await orch._select_lms_tools_llm("как дела с деньгами и продажами в этом месяце?", _owner())
    assert tools == ["finance_summary", "sales_funnel"]


@pytest.mark.asyncio
async def test_select_lms_tools_llm_falls_back_on_bad_json(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose="text": True)

    class _Result:
        ok = True
        text = "не json"

        def json_object(self):
            return None

    async def _fake_complete_text(**kwargs):
        return _Result()

    monkeypatch.setattr(ai_gateway, "complete_text", _fake_complete_text)
    tools = await orch._select_lms_tools_llm("посчитай рентабельность", _owner())
    assert tools == ["finance_summary"]
