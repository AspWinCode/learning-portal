"""Параметры сортировки списка задач owner workspace (unit-testable)."""

from __future__ import annotations

from typing import Optional, Tuple

ALLOWED_TASK_SORT_FIELDS = frozenset({"created_at", "updated_at", "deadline_at", "title", "priority"})


def normalize_task_sort_params(sort_by: Optional[str], sort_dir: Optional[str]) -> Tuple[str, bool]:
    """
    Возвращает (поле, descending).
    Невалидные значения → created_at, desc.
    """
    sb = (sort_by or "created_at").strip().lower()
    if sb not in ALLOWED_TASK_SORT_FIELDS:
        sb = "created_at"
    sd = (sort_dir or "desc").strip().lower()
    descending = sd != "asc"
    return sb, descending
