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
    conn = op.get_bind()
    conn.execute(
        text("""
            INSERT INTO finance_accounts (code, name, owner_scope, is_active, created_at, updated_at)
            VALUES ('nalichka', 'Наличка', 'business', true, now(), NULL)
            ON CONFLICT (code) DO NOTHING
        """)
    )


def downgrade() -> None:
    op.execute(text("DELETE FROM finance_accounts WHERE code = 'nalichka'"))
