"""Unit-тесты ключей дедупликации уведомлений owner workspace."""

from datetime import datetime, timezone

from app.services.owner_workspace_notifications import due_soon_dedupe_key, overdue_dedupe_key


class TestDedupeKeys:
    def test_overdue_key_stable(self):
        assert overdue_dedupe_key(42) == "ow:overdue:42"

    def test_due_soon_key_uses_utc_date(self):
        dt = datetime(2026, 3, 21, 15, 30, tzinfo=timezone.utc)
        assert due_soon_dedupe_key(7, dt) == "ow:due_soon:7:2026-03-21"

    def test_due_soon_key_different_task_same_deadline(self):
        dt = datetime(2026, 1, 2, 0, 0, tzinfo=timezone.utc)
        assert due_soon_dedupe_key(1, dt) != due_soon_dedupe_key(2, dt)
