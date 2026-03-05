"""Task tags for day-desk grouping

Revision ID: 0063_task_tags
Revises: 0062_task_today_view
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0063_task_tags"
down_revision = "0062_task_today_view"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("tags", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "tags")

