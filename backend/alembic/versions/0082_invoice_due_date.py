"""0082: invoice due_date — срок оплаты счёта

Revision ID: 0082
Revises: 0081
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0082"
down_revision = "0081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "due_date")
