"""Add price to abonements

Revision ID: 0005_add_abonement_price
Revises: 0004_add_abonements
Create Date: 2026-01-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_add_abonement_price"
down_revision = "0004_add_abonements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("abonements", sa.Column("price", sa.Float(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("abonements", "price")

