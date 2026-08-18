"""Add sales_school_contacts table

Revision ID: 0169
Revises: 0168
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0169"
down_revision = "0168"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_school_contacts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("sales_schools.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("position", sa.String(), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("phone_extra", sa.String(64), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("sales_school_contacts")
