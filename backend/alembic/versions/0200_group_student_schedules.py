"""Add group_student_schedules table.

Revision ID: 0200
Revises: 0199
Create Date: 2026-09-25

Lets a student enrolled in a group be restricted to specific weekly
schedule slots (e.g. attends only Monday in a group that meets Mon+Thu),
instead of implicitly being expected at every GroupSchedule slot.
No rows for a given group_student = unrestricted (attends every slot),
so existing enrollments are unaffected.
"""
from alembic import op
import sqlalchemy as sa


revision = "0200"
down_revision = "0199"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_student_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_student_id", sa.Integer(), sa.ForeignKey("group_students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_schedule_id", sa.Integer(), sa.ForeignKey("group_schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("group_student_id", "group_schedule_id", name="uq_group_student_schedule"),
    )
    op.create_index("ix_group_student_schedules_group_student_id", "group_student_schedules", ["group_student_id"])
    op.create_index("ix_group_student_schedules_group_schedule_id", "group_student_schedules", ["group_schedule_id"])


def downgrade() -> None:
    op.drop_index("ix_group_student_schedules_group_schedule_id", table_name="group_student_schedules")
    op.drop_index("ix_group_student_schedules_group_student_id", table_name="group_student_schedules")
    op.drop_table("group_student_schedules")
