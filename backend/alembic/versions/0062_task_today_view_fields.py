"""Task today-view: scheduled_for, due_at, priority, pinned_today

Revision ID: 0062_task_today_view
Revises: 0061_b2b_school_district
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0062_task_today_view"
down_revision = "0061_b2b_school_district"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("scheduled_for", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("priority", sa.String(20), nullable=False, server_default="normal"))
    op.add_column("tasks", sa.Column("pinned_today", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_tasks_scheduled_for", "tasks", ["scheduled_for"], unique=False, if_not_exists=True)
    op.create_index("ix_tasks_due_at", "tasks", ["due_at"], unique=False, if_not_exists=True)
    op.create_index("ix_tasks_priority", "tasks", ["priority"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_tasks_priority", table_name="tasks")
    op.drop_index("ix_tasks_due_at", table_name="tasks")
    op.drop_index("ix_tasks_scheduled_for", table_name="tasks")
    op.drop_column("tasks", "pinned_today")
    op.drop_column("tasks", "priority")
    op.drop_column("tasks", "due_at")
    op.drop_column("tasks", "scheduled_for")
