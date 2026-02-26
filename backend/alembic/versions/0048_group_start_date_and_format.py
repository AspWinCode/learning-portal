"""Add group start_date and lesson_format (group/individual).

Revision ID: 0048_group_start_and_format
Revises: 0047_eight_lessons
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0048_group_start_and_format"
down_revision = "0047_eight_lessons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("groups", sa.Column("lesson_format", sa.String(16), nullable=False, server_default="group"))


def downgrade() -> None:
    op.drop_column("groups", "lesson_format")
    op.drop_column("groups", "start_date")
