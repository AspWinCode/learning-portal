"""Add sales_instruction_images table

Revision ID: 0018_sales_instruction_images
Revises: 0017_sales_instructions
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0018_sales_instruction_images"
down_revision = "0017_sales_instructions"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "sales_instruction_images"):
        op.create_table(
            "sales_instruction_images",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("data", sa.LargeBinary(), nullable=False),
            sa.Column("content_type", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "sales_instruction_images"):
        op.drop_table("sales_instruction_images")

