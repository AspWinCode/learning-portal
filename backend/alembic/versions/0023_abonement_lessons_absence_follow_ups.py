"""Add abonement.lessons_count and absence_follow_ups table

Revision ID: 0023_abonement_lessons_abs
Revises: 0022_student_accounts
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0023_abonement_lessons_abs"
down_revision = "0022_student_accounts"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "abonements", "lessons_count"):
        op.add_column("abonements", sa.Column("lessons_count", sa.Integer(), nullable=True))
    if not _table_exists(conn, "absence_follow_ups"):
        op.create_table(
            "absence_follow_ups",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_attendance_id", sa.Integer(), sa.ForeignKey("lesson_attendance.id"), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
            sa.Column("lesson_date", sa.Date(), nullable=False),
            sa.Column("stage", sa.String(), nullable=False, server_default="missed"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_absence_follow_ups_lesson_attendance_id", "absence_follow_ups", ["lesson_attendance_id"], unique=True, if_not_exists=True)
        op.create_index("ix_absence_follow_ups_student_id", "absence_follow_ups", ["student_id"], if_not_exists=True)
        op.create_index("ix_absence_follow_ups_group_id", "absence_follow_ups", ["group_id"], if_not_exists=True)
        op.create_index("ix_absence_follow_ups_lesson_date", "absence_follow_ups", ["lesson_date"], if_not_exists=True)
        op.create_index("ix_absence_follow_ups_stage", "absence_follow_ups", ["stage"], if_not_exists=True)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "absence_follow_ups"):
        op.drop_index("ix_absence_follow_ups_stage", table_name="absence_follow_ups")
        op.drop_index("ix_absence_follow_ups_lesson_date", table_name="absence_follow_ups")
        op.drop_index("ix_absence_follow_ups_group_id", table_name="absence_follow_ups")
        op.drop_index("ix_absence_follow_ups_student_id", table_name="absence_follow_ups")
        op.drop_index("ix_absence_follow_ups_lesson_attendance_id", table_name="absence_follow_ups")
        op.drop_table("absence_follow_ups")
    if _column_exists(conn, "abonements", "lessons_count"):
        op.drop_column("abonements", "lessons_count")
