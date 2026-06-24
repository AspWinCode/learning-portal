"""student account payment finance fields

Revision ID: 0131_student_account_payment_finance_fields
Revises: 0130_student_personal_discount
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0131_student_account_payment_finance_fields"
down_revision = "0130_student_personal_discount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_account_transactions",
        sa.Column("finance_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "student_account_transactions",
        sa.Column("finance_transaction_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "student_account_transactions",
        sa.Column("discount_type", sa.String(length=16), nullable=False, server_default="none"),
    )
    op.add_column(
        "student_account_transactions",
        sa.Column("discount_value", sa.Float(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_student_account_transactions_finance_account_id",
        "student_account_transactions",
        ["finance_account_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_student_account_transactions_finance_transaction_id",
        "student_account_transactions",
        ["finance_transaction_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_foreign_key(
        "fk_student_account_transactions_finance_account_id",
        "student_account_transactions",
        "finance_accounts",
        ["finance_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_student_account_transactions_finance_transaction_id",
        "student_account_transactions",
        "finance_transactions",
        ["finance_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_student_account_transactions_finance_transaction_id",
        "student_account_transactions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_student_account_transactions_finance_account_id",
        "student_account_transactions",
        type_="foreignkey",
    )
    op.drop_index("ix_student_account_transactions_finance_transaction_id", table_name="student_account_transactions")
    op.drop_index("ix_student_account_transactions_finance_account_id", table_name="student_account_transactions")
    op.drop_column("student_account_transactions", "discount_value")
    op.drop_column("student_account_transactions", "discount_type")
    op.drop_column("student_account_transactions", "finance_transaction_id")
    op.drop_column("student_account_transactions", "finance_account_id")
