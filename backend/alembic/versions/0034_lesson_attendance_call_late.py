"""Add call_result, call_result_at, late to lesson_attendance for call-round flow

Revision ID: 0034_lesson_attendance_call_late
Revises: 0033_b2b_preference
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0034_lesson_attendance_call_late"
down_revision = "0033_b2b_preference"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "lesson_attendance", "late"):
        op.add_column("lesson_attendance", sa.Column("late", sa.Boolean(), nullable=False, server_default="false"))
    if not _column_exists(conn, "lesson_attendance", "call_result"):
        op.add_column("lesson_attendance", sa.Column("call_result", sa.String(32), nullable=True))
    if not _column_exists(conn, "lesson_attendance", "call_result_at"):
        op.add_column("lesson_attendance", sa.Column("call_result_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "lesson_attendance", "call_result_at"):
        op.drop_column("lesson_attendance", "call_result_at")
    if _column_exists(conn, "lesson_attendance", "call_result"):
        op.drop_column("lesson_attendance", "call_result")
    if _column_exists(conn, "lesson_attendance", "late"):
        op.drop_column("lesson_attendance", "late")
