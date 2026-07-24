"""Add click tracking columns to email_broadcast_recipients.

Revision ID: 0155
Revises: 0154
Create Date: 2026-07-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0155"
down_revision = "0153_email_broadcast_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_broadcast_recipients",
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "email_broadcast_recipients",
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("email_broadcast_recipients", "click_count")
    op.drop_column("email_broadcast_recipients", "clicked_at")
