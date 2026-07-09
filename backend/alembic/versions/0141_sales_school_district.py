"""sales_school_district: add district column to sales_schools

Revision ID: 0141_sales_school_district
Revises: 0140_student_course_progress
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0141_sales_school_district"
down_revision = "0140_student_course_progress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_schools", sa.Column("district", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("sales_schools", "district")
