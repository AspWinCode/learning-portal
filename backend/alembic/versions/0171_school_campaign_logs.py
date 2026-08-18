"""School campaign CRM logs

Revision ID: 0171
Revises: 0170
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0171"
down_revision = "0170"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "school_campaign_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_campaign_id", sa.Integer(), sa.ForeignKey("school_campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(32), nullable=False, server_default="call"),
        sa.Column("result", sa.String(64), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("school_campaign_logs")
