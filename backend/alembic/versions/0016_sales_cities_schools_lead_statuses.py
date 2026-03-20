"""Add sales_cities, sales_schools, lead_statuses tables

Revision ID: 0016_sales_cities_schools
Revises: 0015_task_repeat_fields
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0016_sales_cities_schools"
down_revision = "0015_task_repeat_fields"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _index_exists(conn, table_name: str, index_name: str) -> bool:
    inspector = inspect(conn)
    return any(ix["name"] == index_name for ix in inspector.get_indexes(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "sales_cities"):
        op.create_table(
            "sales_cities",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.execute("DROP INDEX IF EXISTS ix_sales_cities_name")
        op.execute("DROP INDEX IF EXISTS ix_sales_cities_is_active")
        op.create_index("ix_sales_cities_name", "sales_cities", ["name"], unique=True)

    if not _table_exists(conn, "sales_schools"):
        op.create_table(
            "sales_schools",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.execute("DROP INDEX IF EXISTS ix_sales_schools_name")
        op.execute("DROP INDEX IF EXISTS ix_sales_schools_is_active")
        op.create_index("ix_sales_schools_name", "sales_schools", ["name"], unique=True)
        op.create_index("ix_sales_schools_is_active", "sales_schools", ["is_active"], unique=False)

    if not _table_exists(conn, "lead_statuses"):
        op.create_table(
            "lead_statuses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("base_status", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.execute("DROP INDEX IF EXISTS ix_lead_statuses_name")
        op.execute("DROP INDEX IF EXISTS ix_lead_statuses_base_status")
        op.execute("DROP INDEX IF EXISTS ix_lead_statuses_is_active")
        op.create_index("ix_lead_statuses_name", "lead_statuses", ["name"], unique=True)
        op.create_index("ix_lead_statuses_base_status", "lead_statuses", ["base_status"], unique=False)
        op.create_index("ix_lead_statuses_is_active", "lead_statuses", ["is_active"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "lead_statuses"):
        op.drop_index("ix_lead_statuses_is_active", table_name="lead_statuses")
        op.drop_index("ix_lead_statuses_base_status", table_name="lead_statuses")
        op.drop_index("ix_lead_statuses_name", table_name="lead_statuses")
        op.drop_table("lead_statuses")
    if _table_exists(conn, "sales_schools"):
        op.drop_index("ix_sales_schools_is_active", table_name="sales_schools")
        op.drop_index("ix_sales_schools_name", table_name="sales_schools")
        op.drop_table("sales_schools")
    if _table_exists(conn, "sales_cities"):
        op.drop_index("ix_sales_cities_is_active", table_name="sales_cities")
        op.drop_index("ix_sales_cities_name", table_name="sales_cities")
        op.drop_table("sales_cities")
