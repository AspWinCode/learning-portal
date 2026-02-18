"""Add repeat fields to task_templates and tasks

Revision ID: 0015_task_repeat_fields
Revises: 0014_task_manager
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0015_task_repeat_fields"
down_revision = "0014_task_manager"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task_templates", sa.Column("repeat_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("task_templates", sa.Column("repeat_frequency", sa.String(20), nullable=True))
    op.add_column("task_templates", sa.Column("repeat_days", sa.JSON(), nullable=True))
    op.add_column("task_templates", sa.Column("repeat_end_type", sa.String(20), nullable=True))
    op.add_column("task_templates", sa.Column("repeat_end_after_count", sa.Integer(), nullable=True))
    op.add_column("task_templates", sa.Column("repeat_end_until", sa.Date(), nullable=True))

    op.add_column("tasks", sa.Column("repeat_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("tasks", sa.Column("repeat_frequency", sa.String(20), nullable=True))
    op.add_column("tasks", sa.Column("repeat_days", sa.JSON(), nullable=True))
    op.add_column("tasks", sa.Column("repeat_end_type", sa.String(20), nullable=True))
    op.add_column("tasks", sa.Column("repeat_end_after_count", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("repeat_end_until", sa.Date(), nullable=True))


def downgrade() -> None:
    for col in ("repeat_end_until", "repeat_end_after_count", "repeat_end_type", "repeat_days", "repeat_frequency", "repeat_enabled"):
        op.drop_column("tasks", col)
    for col in ("repeat_end_until", "repeat_end_after_count", "repeat_end_type", "repeat_days", "repeat_frequency", "repeat_enabled"):
        op.drop_column("task_templates", col)
