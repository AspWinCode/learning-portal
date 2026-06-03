"""Finance Hub: debts, allocations, hub_status on personal transactions, account_type/project_id on personal accounts

Revision ID: 0100_finance_hub
Revises: 0099_b2b_documents
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0100_finance_hub"
down_revision = "0099_b2b_documents"
branch_labels = None
depends_on = None


def upgrade():
    # --- personal_finance_accounts: add account_type + project_id ---
    op.add_column(
        "personal_finance_accounts",
        sa.Column("account_type", sa.String(16), nullable=False, server_default="other"),
    )
    op.add_column(
        "personal_finance_accounts",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("finance_targets.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_personal_finance_accounts_project_id", "personal_finance_accounts", ["project_id"], if_not_exists=True)

    # --- personal_finance_transactions: add hub_status ---
    op.add_column(
        "personal_finance_transactions",
        sa.Column("hub_status", sa.String(16), nullable=False, server_default="completed"),
    )
    op.create_index("ix_personal_finance_transactions_hub_status", "personal_finance_transactions", ["hub_status"], if_not_exists=True)

    # --- finance_hub_debts ---
    op.create_table(
        "finance_hub_debts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("debt_type", sa.String(8), nullable=False),        # "owe" | "owed"
        sa.Column("counterparty", sa.String(256), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="KZT"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("finance_targets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),  # active|partially_paid|closed
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index("ix_finance_hub_debts_owner_id", "finance_hub_debts", ["owner_id"], if_not_exists=True)
    op.create_index("ix_finance_hub_debts_status", "finance_hub_debts", ["status"], if_not_exists=True)
    op.create_index("ix_finance_hub_debts_due_date", "finance_hub_debts", ["due_date"], if_not_exists=True)

    # --- finance_hub_allocations ---
    op.create_table(
        "finance_hub_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="KZT"),
        sa.Column("from_account_id", sa.Integer(), sa.ForeignKey("personal_finance_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_type", sa.String(16), nullable=False),          # "project" | "personal"
        sa.Column("to_project_id", sa.Integer(), sa.ForeignKey("finance_targets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("personal_finance_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_finance_hub_allocations_owner_id", "finance_hub_allocations", ["owner_id"], if_not_exists=True)
    op.create_index("ix_finance_hub_allocations_date", "finance_hub_allocations", ["date"], if_not_exists=True)
    op.create_index("ix_finance_hub_allocations_from_account_id", "finance_hub_allocations", ["from_account_id"], if_not_exists=True)


def downgrade():
    op.drop_table("finance_hub_allocations")
    op.drop_table("finance_hub_debts")
    op.drop_index("ix_personal_finance_transactions_hub_status", "personal_finance_transactions")
    op.drop_column("personal_finance_transactions", "hub_status")
    op.drop_index("ix_personal_finance_accounts_project_id", "personal_finance_accounts")
    op.drop_column("personal_finance_accounts", "project_id")
    op.drop_column("personal_finance_accounts", "account_type")
