"""Seed program_makeup_compatibility by WinCode rules: Первый шаг only with self; OGE excluded; rest cross-compatible.

Revision ID: 0037_seed_program_makeup_compatibility
Revises: 0036_wincode_absence_freeze_period
Create Date: 2026-02-22

"""
from alembic import op
from sqlalchemy import text, inspect


revision = "0037_seed_program_makeup_compatibility"
down_revision = "0036_wincode_absence_freeze_period"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _categorize(name: str) -> str:
    """Возвращает: 'oge' | 'first_step' | 'general'."""
    if not name:
        return "general"
    n = name.lower().strip()
    if "оге" in n or "огэ" in n:
        return "oge"
    if "первый шаг" in n or "first" in n or "first_step" in n:
        return "first_step"
    return "general"


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "program_makeup_compatibility"):
        return
    rows = conn.execute(text("SELECT id, name FROM programs")).fetchall()
    first_step_ids = []
    general_ids = []
    for (pid, name) in rows:
        cat = _categorize(name)
        if cat == "oge":
            continue
        if cat == "first_step":
            first_step_ids.append(pid)
        else:
            general_ids.append(pid)
    pairs = []
    for pid in first_step_ids:
        pairs.append((pid, pid))
    for i, p1 in enumerate(general_ids):
        for p2 in general_ids[i:]:
            pairs.append((p1, p2))
    if not pairs:
        return
    for (src, tgt) in pairs:
        conn.execute(
            text(
                "INSERT INTO program_makeup_compatibility (source_program_id, target_program_id) "
                "VALUES (:s, :t) ON CONFLICT (source_program_id, target_program_id) DO NOTHING"
            ),
            {"s": src, "t": tgt},
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "program_makeup_compatibility"):
        conn.execute(text("DELETE FROM program_makeup_compatibility"))
