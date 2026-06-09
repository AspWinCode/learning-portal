"""Add finance account 'Наличка' (cash) for manual journal entries.

Revision ID: 0070_finance_account_nalichka
Revises: 0069_group_student_left_at
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "0070_finance_account_nalichka"
down_revision = "0069_group_student_left_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Finance accounts are managed through the UI; no hardcoded accounts.
    pass


def downgrade() -> None:
    pass