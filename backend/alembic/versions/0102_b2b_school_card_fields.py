"""B2B school card fields

Revision ID: 0102_b2b_school_card_fields
Revises: 0101_sales_school_directory_details
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "0102_b2b_school_card_fields"
down_revision = "0101_sales_school_directory_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("b2b_schools", sa.Column("comment", sa.Text(), nullable=True))
    op.add_column("b2b_schools", sa.Column("custom_fields", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("b2b_schools", "custom_fields")
    op.drop_column("b2b_schools", "comment")
