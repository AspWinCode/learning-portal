"""Sales school directory details and B2B email

Revision ID: 0101_sales_school_directory_details
Revises: 0100_finance_hub
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = "0101_sales_school_directory_details"
down_revision = "0100_finance_hub"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_schools", sa.Column("city", sa.String(), nullable=True))
    op.add_column("sales_schools", sa.Column("director", sa.String(), nullable=True))
    op.add_column("sales_schools", sa.Column("email", sa.String(), nullable=True))
    op.add_column("sales_schools", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("sales_schools", sa.Column("phone", sa.String(length=64), nullable=True))
    op.create_index("ix_sales_schools_city", "sales_schools", ["city"], unique=False)
    op.create_index("ix_sales_schools_email", "sales_schools", ["email"], unique=False)

    op.add_column("b2b_schools", sa.Column("email", sa.String(), nullable=True))
    op.create_index("ix_b2b_schools_email", "b2b_schools", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_b2b_schools_email", table_name="b2b_schools")
    op.drop_column("b2b_schools", "email")

    op.drop_index("ix_sales_schools_email", table_name="sales_schools")
    op.drop_index("ix_sales_schools_city", table_name="sales_schools")
    op.drop_column("sales_schools", "phone")
    op.drop_column("sales_schools", "address")
    op.drop_column("sales_schools", "email")
    op.drop_column("sales_schools", "director")
    op.drop_column("sales_schools", "city")
