"""Add abonement_format to abonements.

Revision ID: 0052_abonement_format
Revises: 0051_bank_transactions_expense
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0052_abonement_format"
down_revision = "0051_bank_transactions_expense"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "abonements",
        sa.Column("abonement_format", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("abonements", "abonement_format")

