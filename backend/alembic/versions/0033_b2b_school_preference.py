"""B2B school preference (online/offline/any) for kanban label

Revision ID: 0033_b2b_preference
Revises: 0032_lead_b2b_event
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0033_b2b_preference"
down_revision = "0032_lead_b2b_event"
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
    if _column_exists(conn, "b2b_schools", "preference"):
        return
    op.add_column("b2b_schools", sa.Column("preference", sa.String(32), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "b2b_schools") and _column_exists(conn, "b2b_schools", "preference"):
        op.drop_column("b2b_schools", "preference")
