"""Add description to tasks.

Revision ID: 0044_task_description
Revises: 0043_bank_transactions
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0044_task_description"
down_revision = "0043_bank_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "description")

