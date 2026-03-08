"""Add group_students.left_at for responsible-trainer logic in characteristics report.

Revision ID: 0069_group_student_left_at
Revises: 0068_sales_classes
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = "0069_group_student_left_at"
down_revision = "0068_sales_classes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "group_students",
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("group_students", "left_at")
