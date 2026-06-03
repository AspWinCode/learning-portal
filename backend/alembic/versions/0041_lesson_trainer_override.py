"""Add lesson_trainer_overrides table.

Revision ID: 0041_trainer_override
Revises: 0040_cancellations
Create Date: 2026-02-23

"""
from alembic import op
import sqlalchemy as sa


revision = "0041_trainer_override"
down_revision = "0040_cancellations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lesson_trainer_overrides",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False, index=True),
        sa.Column("lesson_date", sa.Date(), nullable=False, index=True),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
    )
    op.create_index(
        "uq_lesson_trainer_override_group_date_time",
        "lesson_trainer_overrides",
        ["group_id", "lesson_date", "start_time", "end_time"],
        unique=True,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("uq_lesson_trainer_override_group_date_time", table_name="lesson_trainer_overrides")
    op.drop_table("lesson_trainer_overrides")
