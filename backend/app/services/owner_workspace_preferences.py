"""Персональные настройки UI owner workspace (хранение JSON на пользователя)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceUserPreference

DEFAULT_PREFERENCES: Dict[str, Any] = {
    "default_task_view": "list",
    "task_list_rows_per_page": 25,
    "digest_due_within_hours": 48,
    "digest_scope": "all",
    "notify_email_enabled": False,
    "notify_web_push_enabled": False,
    "notify_task_overdue": True,
    "notify_task_due_soon": True,
    "notify_task_assigned": True,
    "notify_task_comment": True,
    "notify_task_updated": True,
    "notify_contact_incoming_message": True,
    "notify_task_mention": True,
}

_VALID_VIEWS = frozenset({"list", "kanban", "calendar", "gantt"})
_VALID_SCOPES = frozenset({"all", "mine"})


def _clamp_int(v: Any, lo: int, hi: int, fallback: int) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return fallback
    return max(lo, min(hi, n))


def normalize_preferences(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Возвращает полный словарь настроек с дефолтами и валидацией."""
    src = raw if isinstance(raw, dict) else {}
    out = dict(DEFAULT_PREFERENCES)

    v = src.get("default_task_view", out["default_task_view"])
    out["default_task_view"] = v if v in _VALID_VIEWS else DEFAULT_PREFERENCES["default_task_view"]

    out["task_list_rows_per_page"] = _clamp_int(
        src.get("task_list_rows_per_page", out["task_list_rows_per_page"]),
        5,
        100,
        int(DEFAULT_PREFERENCES["task_list_rows_per_page"]),
    )

    out["digest_due_within_hours"] = _clamp_int(
        src.get("digest_due_within_hours", out["digest_due_within_hours"]),
        8,
        336,
        int(DEFAULT_PREFERENCES["digest_due_within_hours"]),
    )

    s = src.get("digest_scope", out["digest_scope"])
    out["digest_scope"] = s if s in _VALID_SCOPES else DEFAULT_PREFERENCES["digest_scope"]

    out["notify_email_enabled"] = bool(src.get("notify_email_enabled", DEFAULT_PREFERENCES["notify_email_enabled"]))
    out["notify_web_push_enabled"] = bool(
        src.get("notify_web_push_enabled", DEFAULT_PREFERENCES["notify_web_push_enabled"])
    )

    for key in (
        "notify_task_overdue",
        "notify_task_due_soon",
        "notify_task_assigned",
        "notify_task_comment",
        "notify_task_updated",
        "notify_contact_incoming_message",
        "notify_task_mention",
    ):
        out[key] = bool(src.get(key, DEFAULT_PREFERENCES[key]))

    return out


def get_preferences_for_user(db: Session, user_id: int) -> Dict[str, Any]:
    row = db.query(OwnerWorkspaceUserPreference).filter(OwnerWorkspaceUserPreference.user_id == user_id).first()
    raw = row.preferences if row and isinstance(row.preferences, dict) else {}
    return normalize_preferences(raw)


def merge_preferences_for_user(db: Session, user_id: int, patch: Dict[str, Any]) -> Dict[str, Any]:
    current = get_preferences_for_user(db, user_id)
    merged_in = {**current, **{k: v for k, v in patch.items() if v is not None}}
    normalized = normalize_preferences(merged_in)

    row = db.query(OwnerWorkspaceUserPreference).filter(OwnerWorkspaceUserPreference.user_id == user_id).first()
    if row is None:
        row = OwnerWorkspaceUserPreference(user_id=user_id, preferences=normalized)
        db.add(row)
    else:
        row.preferences = normalized
    db.commit()
    db.refresh(row)
    return normalize_preferences(row.preferences)
