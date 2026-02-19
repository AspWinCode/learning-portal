"""Add source (откуда пришел) to student_cards

Revision ID: 0021_student_card_source
Revises: 0020_student_card_extra_fields
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0021_student_card_source"
down_revision = "0020_student_card_extra_fields"
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
    if not _column_exists(conn, "student_cards", "source"):
        op.add_column("student_cards", sa.Column("source", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_cards"):
        return
    if _column_exists(conn, "student_cards", "source"):
        op.drop_column("student_cards", "source")
