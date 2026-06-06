"""Unit-тесты нормализации сортировки списка задач owner workspace."""

from app.services.owner_workspace_task_order import ALLOWED_TASK_SORT_FIELDS, normalize_task_sort_params


class TestNormalizeTaskSortParams:
    def test_defaults(self):
        sb, desc = normalize_task_sort_params(None, None)
        assert sb == "deadline_at"
        assert desc is False

    def test_explicit_asc_deadline(self):
        sb, desc = normalize_task_sort_params("deadline_at", "asc")
        assert sb == "deadline_at"
        assert desc is False

    def test_invalid_sort_by_falls_back(self):
        sb, desc = normalize_task_sort_params("not_a_column", "desc")
        assert sb == "deadline_at"
        assert desc is True

    def test_invalid_sort_dir_treated_as_asc(self):
        sb, desc = normalize_task_sort_params("title", "sideways")
        assert sb == "title"
        assert desc is False

    def test_priority_whitelisted(self):
        assert "priority" in ALLOWED_TASK_SORT_FIELDS
        sb, desc = normalize_task_sort_params("priority", "asc")
        assert sb == "priority"
        assert desc is False

    def test_table_columns_whitelisted(self):
        assert {"status", "assignee", "project", "contact"}.issubset(ALLOWED_TASK_SORT_FIELDS)
