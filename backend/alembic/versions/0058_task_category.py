"""Add task category (schools/parents/leads)

Revision ID: 0058_task_category
Revises: 0057_lesson_cancellation_move_target
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa


revision = "0058_task_category"
down_revision = "0057_lesson_cancellation_move_target"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("category", sa.String(20), nullable=False, server_default="schools"))
    op.create_index("ix_tasks_category", "tasks", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_category", table_name="tasks")
    op.drop_column("tasks", "category")
