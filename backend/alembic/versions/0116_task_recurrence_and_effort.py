"""Add recurrence fields + effort to owner_workspace_tasks

Revision ID: 0116_task_recurrence_and_effort
Revises: 0115_owner_workspace_task_templates
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0116_task_recurrence_and_effort"
down_revision = "0115_owner_workspace_task_templates"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owner_workspace_tasks", sa.Column("repeat_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_frequency", sa.String(20), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_interval", sa.Integer(), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_days", sa.JSON(), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_end_type", sa.String(20), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_end_after_count", sa.Integer(), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_end_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("repeat_count", sa.Integer(), nullable=False, server_default="0"))
    # effort fields (stored on task itself, not only on template)
    op.add_column("owner_workspace_tasks", sa.Column("effort_hours", sa.Integer(), nullable=True))
    op.add_column("owner_workspace_tasks", sa.Column("effort_minutes", sa.Integer(), nullable=True))


def downgrade():
    for col in ["repeat_enabled", "repeat_frequency", "repeat_interval", "repeat_days",
                "repeat_end_type", "repeat_end_after_count", "repeat_end_until", "repeat_count",
                "effort_hours", "effort_minutes"]:
        op.drop_column("owner_workspace_tasks", col)
