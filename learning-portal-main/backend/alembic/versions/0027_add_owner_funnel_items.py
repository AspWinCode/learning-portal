"""Add owner_funnel_items table for owner funnels (support letters, thank you letters)

Revision ID: 0027_add_owner_funnel_items
Revises: 0026_groupstatus_accept_lowercase
Create Date: 2026-02-17

"""
from alembic import op
import sqlalchemy as sa


revision = "0027_add_owner_funnel_items"
down_revision = "0026_groupstatus_accept_lowercase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_funnel_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("funnel_type", sa.String(64), nullable=False, index=True),
        sa.Column("stage", sa.String(64), nullable=False, index=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("owner_funnel_items")
