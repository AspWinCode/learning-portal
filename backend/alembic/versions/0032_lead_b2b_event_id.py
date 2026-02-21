"""Lead.b2b_event_id — связь лида с B2B-мероприятием

Revision ID: 0032_lead_b2b_event
Revises: 0031_b2b_events
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0032_lead_b2b_event"
down_revision = "0031_b2b_events"
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
    if not _table_exists(conn, "leads"):
        return
    if not _table_exists(conn, "b2b_school_events"):
        return
    if _column_exists(conn, "leads", "b2b_event_id"):
        return
    op.add_column(
        "leads",
        sa.Column("b2b_event_id", sa.Integer(), sa.ForeignKey("b2b_school_events.id"), nullable=True, index=True),
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "leads") and _column_exists(conn, "leads", "b2b_event_id"):
        op.drop_column("leads", "b2b_event_id")
