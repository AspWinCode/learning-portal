"""Drop legacy personal finance and finance hub tables.

Revision ID: 0123_drop_legacy_finance_stacks
Revises: 0122_finance_models_redesign
Create Date: 2026-06-09
"""

from alembic import op


revision = "0123_drop_legacy_finance_stacks"
down_revision = "0122_finance_models_redesign"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The unified ledger is now the only finance transaction source.
    op.execute("DROP TABLE IF EXISTS finance_hub_allocations CASCADE")
    op.execute("DROP TABLE IF EXISTS finance_hub_debts CASCADE")
    op.execute("DROP TABLE IF EXISTS personal_finance_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS personal_finance_transactions CASCADE")
    op.execute("DROP TABLE IF EXISTS personal_finance_categories CASCADE")
    op.execute("DROP TABLE IF EXISTS personal_finance_accounts CASCADE")
    op.execute("DROP TYPE IF EXISTS personalfinancedirection")


def downgrade() -> None:
    # Intentional data-model removal. Historical migrations can rebuild these
    # tables only by downgrading before 0093/0100; this migration does not
    # recreate deprecated tables with empty structures.
    pass
