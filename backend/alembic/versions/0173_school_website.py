"""Add website column to sales_schools and b2b_schools

Revision ID: 0173
Revises: 0172
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0173"
down_revision = "0172"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_schools", sa.Column("website", sa.String(), nullable=True))
    op.add_column("b2b_schools", sa.Column("website", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("b2b_schools", "website")
    op.drop_column("sales_schools", "website")
