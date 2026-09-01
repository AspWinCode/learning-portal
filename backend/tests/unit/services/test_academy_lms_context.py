from app.services.academy_ai import lms_context


class _User:
    def __init__(self, role, permissions):
        self.role = role
        self.custom_role = None
        self.custom_role_id = None
        self.role_permissions = permissions
        self.extra_roles = []


def _owner():
    return _User("owner", ["*"])


def _limited(perms):
    # base role seo_manager: дефолтные права (seo.*) не пересекаются с LMS-инструментами,
    # поэтому итоговый доступ определяют только явные role_permissions
    return _User("seo_manager", perms)


def test_owner_sees_all_tools():
    names = {t["name"] for t in lms_context.available_tools(_owner())}
    assert names == set(lms_context.TOOLS)


def test_limited_user_sees_only_permitted_tools():
    user = _limited(["students.access"])
    names = {t["name"] for t in lms_context.available_tools(user)}
    assert names == {"students_overview"}


def test_finance_tool_requires_both_permissions():
    # только finance.access, без academy_ai.finance_context
    user = _limited(["finance.access"])
    result = lms_context.run_tool("finance_summary", None, user)
    assert result["error"] == "no_permission"
    assert result["missing_permissions"] == ["academy_ai.finance_context"]


def test_run_unknown_tool():
    assert lms_context.run_tool("nope", None, _owner())["error"] == "unknown_tool"


def test_can_use_helper():
    tool = lms_context.TOOLS["schools_directory"]
    assert lms_context.can_use(_limited(["b2b.access"]), tool) is True
    assert lms_context.can_use(_limited(["students.access"]), tool) is False
