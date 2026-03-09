"""Add payment_link field to student_cards for payment URLs.

Revision ID: 0070_student_card_payment_link
Revises: 0069_group_student_left_at
Create Date: 2026-03-09

"""
from alembic import op
import sqlalchemy as sa


revision = "0070_student_card_payment_link"
down_revision = "0069_group_student_left_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_cards",
        sa.Column("payment_link", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("student_cards", "payment_link")

