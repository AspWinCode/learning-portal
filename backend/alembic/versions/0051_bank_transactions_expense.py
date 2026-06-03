"""Add expense_category to bank_transactions (расходы, категории).

Revision ID: 0051_bank_transactions_expense
Revises: 0050_trainer_profile
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0051_bank_transactions_expense"
down_revision = "0050_trainer_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bank_transactions", sa.Column("expense_category", sa.String(64), nullable=True))
    op.create_index(op.f("ix_bank_transactions_expense_category", if_not_exists=True), "bank_transactions", ["expense_category"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bank_transactions_expense_category"), table_name="bank_transactions")
    op.drop_column("bank_transactions", "expense_category")
