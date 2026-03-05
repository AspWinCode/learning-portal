"""Task counters for daily parent replies.

Revision ID: 0064_task_counters
Revises: 0063_task_tags
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0064_task_counters"
down_revision = "0063_task_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_counters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("counter_key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_unique_constraint("uq_task_counters_task_key", "task_counters", ["task_id", "counter_key"])


def downgrade() -> None:
    op.drop_constraint("uq_task_counters_task_key", "task_counters", type_="unique")
    op.drop_table("task_counters")

