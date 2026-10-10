"""Aggregate revision-required work count on student course progress.

Revision ID: 0226
Revises: 0225
"""
import sqlalchemy as sa
from alembic import op

revision = "0226"
down_revision = "0225"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_course_progress",
        sa.Column("revision_required_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("student_course_progress", "revision_required_count")
