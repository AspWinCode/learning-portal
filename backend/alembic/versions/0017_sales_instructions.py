"""Add sales_instructions table

Revision ID: 0017_sales_instructions
Revises: 0016_sales_cities_schools
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision = "0017_sales_instructions"
down_revision = "0016_sales_cities_schools"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "sales_instructions"):
        op.create_table(
            "sales_instructions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "sales_instructions"):
        op.drop_table("sales_instructions")

