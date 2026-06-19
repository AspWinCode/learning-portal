"""student_card tochka_payer_name

Revision ID: 0129_student_card_tochka_payer_name
Revises: 0128_dedupe_tochka_transactions
Create Date: 2026-06-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0129_student_card_tochka_payer_name"
down_revision = "0128_dedupe_tochka_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_cards",
        sa.Column("tochka_payer_name", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("student_cards", "tochka_payer_name")
