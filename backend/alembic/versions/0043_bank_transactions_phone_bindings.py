"""Add bank_transactions, phone_payment_bindings, primary_for_bank_payments.

Revision ID: 0043_bank_transactions
Revises: 0042_training_start
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0043_bank_transactions"
down_revision = "0042_training_start"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_cards",
        sa.Column("primary_for_bank_payments", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_table(
        "bank_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("operation_id", sa.String(256), nullable=False),
        sa.Column("tochka_account_id", sa.String(64), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payer_phone", sa.String(32), nullable=True),
        sa.Column("payer_name", sa.String(512), nullable=True),
        sa.Column("payment_date", sa.String(32), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="new"),
        sa.Column("student_id", sa.Integer(), nullable=True),
        sa.Column("student_account_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_account_id"], ["student_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_id", name="uq_bank_transactions_operation_id"),
    )
    op.create_index(op.f("ix_bank_transactions_operation_id", if_not_exists=True), "bank_transactions", ["operation_id"], unique=True)
    op.create_index(op.f("ix_bank_transactions_payer_phone", if_not_exists=True), "bank_transactions", ["payer_phone"], unique=False)
    op.create_index(op.f("ix_bank_transactions_status", if_not_exists=True), "bank_transactions", ["status"], unique=False)
    op.create_index(op.f("ix_bank_transactions_tochka_account_id", if_not_exists=True), "bank_transactions", ["tochka_account_id"], unique=False)

    op.create_table(
        "phone_payment_bindings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("payer_phone_normalized", sa.String(32), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payer_phone_normalized", name="uq_phone_payment_bindings_phone"),
    )
    op.create_index(op.f("ix_phone_payment_bindings_payer_phone_normalized", if_not_exists=True), "phone_payment_bindings", ["payer_phone_normalized"], unique=True)
    op.create_index(op.f("ix_phone_payment_bindings_parent_id", if_not_exists=True), "phone_payment_bindings", ["parent_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_phone_payment_bindings_parent_id"), table_name="phone_payment_bindings")
    op.drop_index(op.f("ix_phone_payment_bindings_payer_phone_normalized"), table_name="phone_payment_bindings")
    op.drop_table("phone_payment_bindings")
    op.drop_index(op.f("ix_bank_transactions_tochka_account_id"), table_name="bank_transactions")
    op.drop_index(op.f("ix_bank_transactions_status"), table_name="bank_transactions")
    op.drop_index(op.f("ix_bank_transactions_payer_phone"), table_name="bank_transactions")
    op.drop_index(op.f("ix_bank_transactions_operation_id"), table_name="bank_transactions")
    op.drop_table("bank_transactions")
    op.drop_column("student_cards", "primary_for_bank_payments")
