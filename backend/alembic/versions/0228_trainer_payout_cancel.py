"""Link TrainerPayout to its FinanceTransaction so a payout can be cancelled.

Revision ID: 0228
Revises: 0227
"""
import sqlalchemy as sa
from alembic import op

revision = "0228"
down_revision = "0227"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trainer_payouts",
        sa.Column("finance_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_trainer_payouts_finance_transaction_id",
        "trainer_payouts",
        "finance_transactions",
        ["finance_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_trainer_payouts_finance_transaction_id", "trainer_payouts", type_="foreignkey"
    )
    op.drop_column("trainer_payouts", "finance_transaction_id")
