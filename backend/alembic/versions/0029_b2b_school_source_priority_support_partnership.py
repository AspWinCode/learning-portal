"""B2B schools: source, priority, support_letter_status, partnership (ТЗ)

Revision ID: 0029_b2b_extra
Revises: 0028_b2b_schools_conveyor
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0029_b2b_extra"
down_revision = "0028_b2b_schools_conveyor"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"), {"t": name}
    ).scalar() is not None


def _column_exists(conn, table, column):
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    if not _column_exists(conn, "b2b_schools", "source"):
        op.add_column("b2b_schools", sa.Column("source", sa.String(256), nullable=True))
    if not _column_exists(conn, "b2b_schools", "priority"):
        op.add_column("b2b_schools", sa.Column("priority", sa.String(64), nullable=True))
    if not _column_exists(conn, "b2b_schools", "support_letter_status"):
        op.add_column("b2b_schools", sa.Column("support_letter_status", sa.String(32), nullable=True))
    if not _column_exists(conn, "b2b_schools", "partnership"):
        op.add_column("b2b_schools", sa.Column("partnership", sa.JSON(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    for col in ("partnership", "support_letter_status", "priority", "source"):
        if _column_exists(conn, "b2b_schools", col):
            op.drop_column("b2b_schools", col)
