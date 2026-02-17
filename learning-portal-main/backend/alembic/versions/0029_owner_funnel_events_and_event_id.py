"""Add owner_funnel_events table and event_id to owner_funnel_items

Revision ID: 0029_owner_funnel_events_and_event_id
Revises: 0028_owner_funnel_items_card_data
Create Date: 2026-02-17

"""
from alembic import op
import sqlalchemy as sa


revision = "0029_owner_funnel_events_and_event_id"
down_revision = "0028_owner_funnel_items_card_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_funnel_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_name", sa.String(512), nullable=False),
        sa.Column("event_dates", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column(
        "owner_funnel_items",
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("owner_funnel_events.id", ondelete="CASCADE"), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("owner_funnel_items", "event_id")
    op.drop_table("owner_funnel_events")
