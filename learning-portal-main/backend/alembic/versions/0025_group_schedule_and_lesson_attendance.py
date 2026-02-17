"""Add group_schedules and lesson_attendance

Revision ID: 0025_group_schedule_and_lesson_attendance
Revises: 0024_pipeline_statuses_and_no_answer_attempt
Create Date: 2026-02-17

"""
from alembic import op
import sqlalchemy as sa


revision = "0025_group_schedule_and_lesson_attendance"
down_revision = "0024_pipeline_statuses_and_no_answer_attempt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_schedules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_group_schedules_group_id", "group_schedules", ["group_id"], unique=False)

    op.create_table(
        "lesson_attendance",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("attended", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("group_id", "lesson_date", "student_id", name="uq_lesson_attendance_group_date_student"),
    )
    op.create_index("ix_lesson_attendance_group_date", "lesson_attendance", ["group_id", "lesson_date"], unique=False)


def downgrade() -> None:
    op.drop_table("lesson_attendance")
    op.drop_table("group_schedules")
