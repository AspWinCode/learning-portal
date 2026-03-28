"""Unit-тесты ключей дедупликации уведомлений owner workspace."""

from datetime import datetime, timezone

from app.services.owner_workspace_notifications import (
    assign_dedupe_key,
    comment_dedupe_key,
    due_soon_dedupe_key,
    mention_dedupe_key,
    overdue_dedupe_key,
    task_updated_dedupe_key,
)


class TestDedupeKeys:
    def test_overdue_key_stable(self):
        assert overdue_dedupe_key(42) == "ow:overdue:42"

    def test_due_soon_key_uses_utc_date(self):
        dt = datetime(2026, 3, 21, 15, 30, tzinfo=timezone.utc)
        assert due_soon_dedupe_key(7, dt) == "ow:due_soon:7:2026-03-21"

    def test_due_soon_key_different_task_same_deadline(self):
        dt = datetime(2026, 1, 2, 0, 0, tzinfo=timezone.utc)
        assert due_soon_dedupe_key(1, dt) != due_soon_dedupe_key(2, dt)

    def test_assign_key_includes_task_assignee_ts(self):
        assert assign_dedupe_key(10, 5, 1_700_000_000_000) == "ow:assign:10:5:1700000000000"

    def test_comment_key_per_recipient(self):
        assert comment_dedupe_key(99, 3) == "ow:comment:99:u3"
        assert comment_dedupe_key(99, 4) != comment_dedupe_key(99, 3)

    def test_mention_key_per_recipient(self):
        assert mention_dedupe_key(5, 8) == "ow:mention:5:u8"
        assert mention_dedupe_key(5, 9) != mention_dedupe_key(5, 8)

    def test_task_updated_key_per_recipient(self):
        assert task_updated_dedupe_key(1, 2, 1000, 5) == "ow:task_upd:1:2:1000:u5"
        assert task_updated_dedupe_key(1, 2, 1000, 6) != task_updated_dedupe_key(1, 2, 1000, 5)
