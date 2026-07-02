"""student card prepaid periods

Revision ID: 0134_student_card_prepaid_periods
Revises: 0133_transcriptions
Create Date: 2026-07-02
"""

import sqlalchemy as sa
from alembic import op

revision = "0134_student_card_prepaid_periods"
down_revision = "0133_transcriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_cards",
        sa.Column("prepaid_periods", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("student_cards", "prepaid_periods")
