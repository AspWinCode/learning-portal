"""Add optional lesson_start_time, lesson_end_time to lesson_attendance for moved lessons.

Revision ID: 0039_lesson_time
Revises: 0038_anketa_status
Create Date: 2026-02-23

"""
from alembic import op
import sqlalchemy as sa


revision = "0039_lesson_time"
down_revision = "0038_anketa_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lesson_attendance",
        sa.Column("lesson_start_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "lesson_attendance",
        sa.Column("lesson_end_time", sa.Time(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lesson_attendance", "lesson_end_time")
    op.drop_column("lesson_attendance", "lesson_start_time")
