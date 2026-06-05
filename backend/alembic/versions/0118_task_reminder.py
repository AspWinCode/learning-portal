"""Add reminder fields to owner_workspace_tasks

Revision ID: 0118_task_reminder
Revises: 0117_task_watchers
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0118_task_reminder"
down_revision = "0117_task_watchers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owner_workspace_tasks", sa.Column("reminder_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("reminder_sent", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_ow_tasks_reminder_at", "owner_workspace_tasks", ["reminder_at"])


def downgrade():
    op.drop_index("ix_ow_tasks_reminder_at", "owner_workspace_tasks")
    op.drop_column("owner_workspace_tasks", "reminder_sent")
    op.drop_column("owner_workspace_tasks", "reminder_at")
