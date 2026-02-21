"""B2B school events (format, online_type, dates)

Revision ID: 0031_b2b_events
Revises: 0030_b2b_interactions
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0031_b2b_events"
down_revision = "0030_b2b_interactions"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"), {"t": name}
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    if _table_exists(conn, "b2b_school_events"):
        return
    op.create_table(
        "b2b_school_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("b2b_school_id", sa.Integer(), sa.ForeignKey("b2b_schools.id"), nullable=False, index=True),
        sa.Column("format", sa.String(32), nullable=False),
        sa.Column("online_type", sa.String(32), nullable=True),
        sa.Column("event_dates", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "b2b_school_events"):
        op.drop_table("b2b_school_events")
