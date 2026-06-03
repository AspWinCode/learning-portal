"""Task task_kind and reminder_stage for payment overdue reminders.

Revision ID: 0065_task_kind_reminder
Revises: 0064_task_counters
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa


revision = "0065_task_kind_reminder"
down_revision = "0064_task_counters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("task_kind", sa.String(length=64), nullable=True))
    op.add_column("tasks", sa.Column("reminder_stage", sa.Integer(), nullable=True))
    op.create_index("ix_tasks_task_kind", "tasks", ["task_kind"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_tasks_task_kind", table_name="tasks")
    op.drop_column("tasks", "reminder_stage")
    op.drop_column("tasks", "task_kind")
