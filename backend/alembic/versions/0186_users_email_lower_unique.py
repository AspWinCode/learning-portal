"""0186: case-insensitive unique constraint on users.email

Гарантирует, что нельзя зарегистрировать второй аккаунт с той же почтой,
отличающейся только регистром (Ivan@x.ru == ivan@x.ru).

Revision ID: 0186
Revises: 0185
Create Date: 2026-09-07
"""

from alembic import op


revision = "0186"
down_revision = "0185"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Привести существующие адреса к нижнему регистру, чтобы не нарушить индекс.
    op.execute("UPDATE users SET email = lower(email) WHERE email <> lower(email)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_lower "
        "ON users (lower(email))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_email_lower")
