"""owner workspace recurring occupied slots

Revision ID: 0234
Revises: 0233
"""

from alembic import op
import sqlalchemy as sa


revision = "0234"
down_revision = "0233"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_recurring_slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("recurrence_type", sa.String(length=32), nullable=False, server_default="weekly"),
        sa.Column("weekdays", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_owner_workspace_recurring_slots_title", "owner_workspace_recurring_slots", ["title"])
    op.create_index("ix_owner_workspace_recurring_slots_is_active", "owner_workspace_recurring_slots", ["is_active"])
    op.create_index("ix_owner_workspace_recurring_slots_created_by", "owner_workspace_recurring_slots", ["created_by"])
    op.create_index("ix_owner_workspace_recurring_slots_created_at", "owner_workspace_recurring_slots", ["created_at"])


def downgrade() -> None:
    op.drop_table("owner_workspace_recurring_slots")
