"""0088: owner workspace notification email outbox

Revision ID: 0088_owner_workspace_notification_email_outbox
Revises: 0087_owner_workspace_participant_role
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0088_owner_workspace_notification_email_outbox"
down_revision = "0087_owner_workspace_participant_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("email_delivery_status", sa.String(length=24), nullable=False, server_default="disabled"),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("email_last_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("email_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("email_last_error", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_owner_workspace_notifications_email_delivery_status",
        "owner_workspace_notifications",
        ["email_delivery_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_owner_workspace_notifications_email_delivery_status",
        table_name="owner_workspace_notifications",
    )
    op.drop_column("owner_workspace_notifications", "email_last_error")
    op.drop_column("owner_workspace_notifications", "email_attempts")
    op.drop_column("owner_workspace_notifications", "email_sent_at")
    op.drop_column("owner_workspace_notifications", "email_last_attempt_at")
    op.drop_column("owner_workspace_notifications", "email_delivery_status")
