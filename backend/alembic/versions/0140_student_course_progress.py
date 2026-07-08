"""student_course_progress: хранение прогресса ученика во внешних курсах (Кодэкс)

Revision ID: 0140_student_course_progress
Revises: 0139_dedupe_tochka_generic_name_duplicates_followup
Create Date: 2026-07-08
"""

import sqlalchemy as sa
from alembic import op

revision = "0140_student_course_progress"
down_revision = "0139_dedupe_tochka_generic_name_duplicates_followup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_course_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("catalog_item_id", sa.Integer(), sa.ForeignKey("course_catalog_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cases_solved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cases_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rank_name", sa.String(length=64), nullable=True),
        sa.Column("badges_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_badge_name", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("student_id", "catalog_item_id", name="uq_student_course_progress"),
    )
    op.create_index("ix_student_course_progress_student_id", "student_course_progress", ["student_id"])
    op.create_index("ix_student_course_progress_catalog_item_id", "student_course_progress", ["catalog_item_id"])


def downgrade() -> None:
    op.drop_index("ix_student_course_progress_catalog_item_id", table_name="student_course_progress")
    op.drop_index("ix_student_course_progress_student_id", table_name="student_course_progress")
    op.drop_table("student_course_progress")
