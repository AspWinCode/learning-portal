"""notes_table: add notes table for per-user notes

Revision ID: 0142_notes_table
Revises: 0141_sales_school_district
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0142_notes_table"
down_revision = "0141_sales_school_district"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(512), nullable=False, server_default="Без названия"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("notes")
