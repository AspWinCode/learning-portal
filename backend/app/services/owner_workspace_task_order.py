"""Параметры сортировки списка задач owner workspace (unit-testable)."""

from __future__ import annotations

from typing import Optional, Tuple

ALLOWED_TASK_SORT_FIELDS = frozenset({
    "created_at",
    "updated_at",
    "deadline_at",
    "title",
    "priority",
    "status",
    "assignee",
    "project",
    "contact",
})


def normalize_task_sort_params(sort_by: Optional[str], sort_dir: Optional[str]) -> Tuple[str, bool]:
    """
    Возвращает (поле, descending).
    Невалидные значения → deadline_at, asc.
    """
    sb = (sort_by or "deadline_at").strip().lower()
    if sb not in ALLOWED_TASK_SORT_FIELDS:
        sb = "deadline_at"
    sd = (sort_dir or "asc").strip().lower()
    descending = sd == "desc"
    return sb, descending
