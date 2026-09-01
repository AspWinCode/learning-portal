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
