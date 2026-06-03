"""Link student_cards to students (student_id) for display name

Revision ID: 0024_student_card_student_id
Revises: 0023_abonement_lessons_abs
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0024_student_card_student_id"
down_revision = "0023_abonement_lessons_abs"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_cards"):
        return
    if not _column_exists(conn, "student_cards", "student_id"):
        op.add_column(
            "student_cards",
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=True),
        )
        op.create_index("ix_student_cards_student_id", "student_cards", ["student_id"], unique=True, if_not_exists=True)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "student_cards") and _column_exists(conn, "student_cards", "student_id"):
        op.drop_index("ix_student_cards_student_id", table_name="student_cards")
        op.drop_column("student_cards", "student_id")
