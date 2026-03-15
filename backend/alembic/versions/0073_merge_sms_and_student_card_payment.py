"""Merge heads: 0072_sms and 0070_student_card_payment_link.

Revision ID: 0073_merge
Revises: 0072_sms, 0070_student_card_payment_link
Create Date: 2026-03-15

"""

from alembic import op
import sqlalchemy as sa


revision = "0073_merge"
down_revision = ("0072_sms", "0070_student_card_payment_link")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
