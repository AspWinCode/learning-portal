"""Add sales_schools table

Revision ID: 0023_add_sales_schools
Revises: 0022_add_sales_cities
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0023_add_sales_schools"
down_revision = "0022_add_sales_cities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_schools",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sales_schools_name", "sales_schools", ["name"], unique=True)
    op.create_index("ix_sales_schools_is_active", "sales_schools", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sales_schools_is_active", table_name="sales_schools")
    op.drop_index("ix_sales_schools_name", table_name="sales_schools")
    op.drop_table("sales_schools")
