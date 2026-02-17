"""Add card_data JSON to owner_funnel_items for events funnel

Revision ID: 0028_owner_funnel_items_card_data
Revises: 0027_add_owner_funnel_items
Create Date: 2026-02-17

"""
from alembic import op
import sqlalchemy as sa


revision = "0028_owner_funnel_items_card_data"
down_revision = "0027_add_owner_funnel_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("owner_funnel_items", sa.Column("card_data", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("owner_funnel_items", "card_data")
