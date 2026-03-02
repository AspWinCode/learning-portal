"""Add moved_to_* fields to lesson_cancellations for move mapping

Revision ID: 0057_lesson_cancellation_move_target
Revises: 0056_unified_finance_ledger
Create Date: 2026-03-02

Эти поля позволяют понимать, на какую дату и время был перенесён урок,
чтобы на старой дате можно было показать «активный» перенесённый слот.
"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0057_lesson_cancellation_move_target"
down_revision = "0056_unified_finance_ledger"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "lesson_cancellations", "moved_to_date"):
        op.add_column("lesson_cancellations", sa.Column("moved_to_date", sa.Date(), nullable=True))
    if not _column_exists(conn, "lesson_cancellations", "moved_to_start_time"):
        op.add_column("lesson_cancellations", sa.Column("moved_to_start_time", sa.Time(), nullable=True))
    if not _column_exists(conn, "lesson_cancellations", "moved_to_end_time"):
        op.add_column("lesson_cancellations", sa.Column("moved_to_end_time", sa.Time(), nullable=True))
    # Индекс по moved_to_date для возможных выборок в будущем
    insp = inspect(conn)
    idx_names = {i["name"] for i in insp.get_indexes("lesson_cancellations")}
    if "ix_lesson_cancellations_moved_to_date" not in idx_names:
        op.create_index(
            "ix_lesson_cancellations_moved_to_date",
            "lesson_cancellations",
            ["moved_to_date"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    idx_names = {i["name"] for i in insp.get_indexes("lesson_cancellations")}
    if "ix_lesson_cancellations_moved_to_date" in idx_names:
        op.drop_index("ix_lesson_cancellations_moved_to_date", table_name="lesson_cancellations")
    if _column_exists(conn, "lesson_cancellations", "moved_to_end_time"):
        op.drop_column("lesson_cancellations", "moved_to_end_time")
    if _column_exists(conn, "lesson_cancellations", "moved_to_start_time"):
        op.drop_column("lesson_cancellations", "moved_to_start_time")
    if _column_exists(conn, "lesson_cancellations", "moved_to_date"):
        op.drop_column("lesson_cancellations", "moved_to_date")

