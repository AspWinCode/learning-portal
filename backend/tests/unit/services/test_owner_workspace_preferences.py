"""Unit-тесты нормализации настроек owner workspace."""

from app.services.owner_workspace_preferences import DEFAULT_PREFERENCES, normalize_preferences


class TestNormalizePreferences:
    def test_empty_uses_defaults(self):
        assert normalize_preferences({}) == DEFAULT_PREFERENCES
        assert normalize_preferences(None) == DEFAULT_PREFERENCES

    def test_clamp_rows_and_hours(self):
        out = normalize_preferences({"task_list_rows_per_page": 3, "digest_due_within_hours": 999})
        assert out["task_list_rows_per_page"] == 5
        assert out["digest_due_within_hours"] == 336

    def test_invalid_view_and_scope_fallback(self):
        out = normalize_preferences({"default_task_view": "oops", "digest_scope": "x"})
        assert out["default_task_view"] == DEFAULT_PREFERENCES["default_task_view"]
        assert out["digest_scope"] == DEFAULT_PREFERENCES["digest_scope"]

    def test_valid_overrides(self):
        out = normalize_preferences(
            {
                "default_task_view": "kanban",
                "task_list_rows_per_page": 50,
                "digest_due_within_hours": 72,
                "digest_scope": "mine",
            }
        )
        assert out["default_task_view"] == "kanban"
        assert out["task_list_rows_per_page"] == 50
        assert out["digest_due_within_hours"] == 72
        assert out["digest_scope"] == "mine"
