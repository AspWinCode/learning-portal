"""Add sales_cities table

Revision ID: 0022_add_sales_cities
Revises: 0021_widen_alembic_version_num
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0022_add_sales_cities"
down_revision = "0021_widen_alembic_version_num"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_cities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sales_cities_name", "sales_cities", ["name"], unique=True)
    op.create_index("ix_sales_cities_is_active", "sales_cities", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sales_cities_is_active", table_name="sales_cities")
    op.drop_index("ix_sales_cities_name", table_name="sales_cities")
    op.drop_table("sales_cities")
