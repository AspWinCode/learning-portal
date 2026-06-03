"""0089: owner workspace web push outbox

Revision ID: 0089_owner_workspace_web_push_outbox
Revises: 0088_owner_workspace_notification_email_outbox
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0089_owner_workspace_web_push_outbox"
down_revision = "0088_owner_workspace_notification_email_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("web_push_delivery_status", sa.String(length=24), nullable=False, server_default="disabled"),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("web_push_last_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("web_push_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("web_push_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "owner_workspace_notifications",
        sa.Column("web_push_last_error", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_owner_workspace_notifications_web_push_delivery_status",
        "owner_workspace_notifications",
        ["web_push_delivery_status"],
        unique=False,
        if_not_exists=True,
    )

    op.create_table(
        "owner_workspace_web_push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_owner_workspace_web_push_subscription_endpoint"),
    )
    op.create_index(
        "ix_owner_workspace_web_push_subscriptions_id",
        "owner_workspace_web_push_subscriptions",
        ["id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_owner_workspace_web_push_subscriptions_user_id",
        "owner_workspace_web_push_subscriptions",
        ["user_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_owner_workspace_web_push_subscriptions_created_at",
        "owner_workspace_web_push_subscriptions",
        ["created_at"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_owner_workspace_web_push_subscriptions_created_at",
        table_name="owner_workspace_web_push_subscriptions",
    )
    op.drop_index(
        "ix_owner_workspace_web_push_subscriptions_user_id",
        table_name="owner_workspace_web_push_subscriptions",
    )
    op.drop_index(
        "ix_owner_workspace_web_push_subscriptions_id",
        table_name="owner_workspace_web_push_subscriptions",
    )
    op.drop_table("owner_workspace_web_push_subscriptions")

    op.drop_index(
        "ix_owner_workspace_notifications_web_push_delivery_status",
        table_name="owner_workspace_notifications",
    )
    op.drop_column("owner_workspace_notifications", "web_push_last_error")
    op.drop_column("owner_workspace_notifications", "web_push_attempts")
    op.drop_column("owner_workspace_notifications", "web_push_sent_at")
    op.drop_column("owner_workspace_notifications", "web_push_last_attempt_at")
    op.drop_column("owner_workspace_notifications", "web_push_delivery_status")
