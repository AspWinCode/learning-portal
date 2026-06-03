"""Add lesson_cancellations table for moved/cancelled slots.

Revision ID: 0040_cancellations
Revises: 0039_lesson_time
Create Date: 2026-02-23

"""
from alembic import op
import sqlalchemy as sa


revision = "0040_cancellations"
down_revision = "0039_lesson_time"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lesson_cancellations",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False, index=True),
        sa.Column("lesson_date", sa.Date(), nullable=False, index=True),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
    )
    op.create_index(
        "uq_lesson_cancellation_group_date_time",
        "lesson_cancellations",
        ["group_id", "lesson_date", "start_time", "end_time"],
        unique=True,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("uq_lesson_cancellation_group_date_time", table_name="lesson_cancellations")
    op.drop_table("lesson_cancellations")
