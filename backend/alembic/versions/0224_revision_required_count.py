"""Агрегат "работ на доработке" на карточке курса ученика (п.20): колонка
revision_required_count в student_course_progress, обновляется из
admin_review_project_submission (routers/codelab.py) при каждом решении
тренера по проекту Codelab, не копирует сами сдачи.

Revision ID: 0224
Revises: 0223
Create Date: 2026-10-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0224"
down_revision = "0223"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_course_progress",
        sa.Column("revision_required_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("student_course_progress", "revision_required_count")
