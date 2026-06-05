"""Add owner_workspace_task_watchers table

Revision ID: 0117_task_watchers
Revises: 0116_task_recurrence_and_effort
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0117_task_watchers"
down_revision = "0116_task_recurrence_and_effort"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "owner_workspace_task_watchers",
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ow_task_watchers_task_id", "owner_workspace_task_watchers", ["task_id"])
    op.create_index("ix_ow_task_watchers_user_id", "owner_workspace_task_watchers", ["user_id"])


def downgrade():
    op.drop_index("ix_ow_task_watchers_user_id", "owner_workspace_task_watchers")
    op.drop_index("ix_ow_task_watchers_task_id", "owner_workspace_task_watchers")
    op.drop_table("owner_workspace_task_watchers")
