"""Add broadcast_id to school_campaign_logs

Revision ID: 0172
Revises: 0171
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0172"
down_revision = "0171"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "school_campaign_logs",
        sa.Column(
            "broadcast_id",
            sa.Integer(),
            sa.ForeignKey("email_broadcasts.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("school_campaign_logs", "broadcast_id")
