"""0083: owner workspace in-app notifications (deadlines)

Revision ID: 0083_owner_workspace_notifications
Revises: 0082_owner_workspace_task_manager
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0083_owner_workspace_notifications"
down_revision = "0082_owner_workspace_task_manager"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=True),
        sa.Column("dedupe_key", sa.String(length=160), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.UniqueConstraint("user_id", "dedupe_key", name="uq_owner_workspace_notification_user_dedupe"),
    )
    op.create_index("ix_owner_workspace_notifications_user_id", "owner_workspace_notifications", ["user_id"])
    op.create_index("ix_owner_workspace_notifications_kind", "owner_workspace_notifications", ["kind"])
    op.create_index("ix_owner_workspace_notifications_task_id", "owner_workspace_notifications", ["task_id"])
    op.create_index("ix_owner_workspace_notifications_created_at", "owner_workspace_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_owner_workspace_notifications_created_at", table_name="owner_workspace_notifications")
    op.drop_index("ix_owner_workspace_notifications_task_id", table_name="owner_workspace_notifications")
    op.drop_index("ix_owner_workspace_notifications_kind", table_name="owner_workspace_notifications")
    op.drop_index("ix_owner_workspace_notifications_user_id", table_name="owner_workspace_notifications")
    op.drop_table("owner_workspace_notifications")
