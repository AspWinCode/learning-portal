"""finance_target is_personal flag

Revision ID: 0135_finance_target_is_personal
Revises: 0134_student_card_prepaid_periods
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0135_finance_target_is_personal"
down_revision = "0134_student_card_prepaid_periods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "finance_targets",
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Пометить "Личные" как личный проект
    op.execute("UPDATE finance_targets SET is_personal = true WHERE code = 'personal'")


def downgrade() -> None:
    op.drop_column("finance_targets", "is_personal")
