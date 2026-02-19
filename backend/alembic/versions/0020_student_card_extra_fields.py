"""Add student card extra fields (parent telegram, emails, messenger, comment)

Revision ID: 0020_student_card_extra_fields
Revises: 0019_student_cards
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0020_student_card_extra_fields"
down_revision = "0019_student_cards"
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
    if not _column_exists(conn, "student_cards", "parent_telegram"):
        op.add_column("student_cards", sa.Column("parent_telegram", sa.String(), nullable=True))
    if not _column_exists(conn, "student_cards", "parent_email"):
        op.add_column("student_cards", sa.Column("parent_email", sa.String(), nullable=True))
    if not _column_exists(conn, "student_cards", "student_email"):
        op.add_column("student_cards", sa.Column("student_email", sa.String(), nullable=True))
    if not _column_exists(conn, "student_cards", "preferred_messenger"):
        op.add_column("student_cards", sa.Column("preferred_messenger", sa.String(), nullable=True))
    if not _column_exists(conn, "student_cards", "comment"):
        op.add_column("student_cards", sa.Column("comment", sa.Text(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_cards"):
        return
    for col in ("comment", "preferred_messenger", "student_email", "parent_email", "parent_telegram"):
        if _column_exists(conn, "student_cards", col):
            op.drop_column("student_cards", col)
