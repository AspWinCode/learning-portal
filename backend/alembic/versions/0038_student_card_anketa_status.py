"""WinCode: анкета — статус жизненного цикла (draft/filled/converted/cancelled). Без дублей.

Revision ID: 0038_anketa_status
Revises: 0037_seed_program_makeup_compatibility
Create Date: 2026-02-22

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0038_anketa_status"
down_revision = "0037_seed_program_makeup_compatibility"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "student_cards", "anketa_status"):
        op.add_column(
            "student_cards",
            sa.Column("anketa_status", sa.String(32), nullable=True),
        )
        # Существующие карточки (с привязанным учеником или без) считаем конвертированными
        op.execute(sa.text("UPDATE student_cards SET anketa_status = 'converted' WHERE anketa_status IS NULL"))
        op.alter_column(
            "student_cards",
            "anketa_status",
            existing_type=sa.String(32),
            nullable=False,
            server_default=sa.text("'converted'"),
        )
        op.create_index("ix_student_cards_anketa_status", "student_cards", ["anketa_status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_student_cards_anketa_status", table_name="student_cards")
    op.drop_column("student_cards", "anketa_status")
