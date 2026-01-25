"""Add telegram + password reset fields to users (idempotent)

Revision ID: 0001_telegram_pwd_reset
Revises: 0000_initial_schema
Create Date: 2026-01-15
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_telegram_pwd_reset"
down_revision = "0000_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL-safe, idempotent migration (supports existing DBs).
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_telegram_chat_id ON users (telegram_chat_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_telegram_link_code ON users (telegram_link_code)")

    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code_hash VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_password_reset_code_hash ON users (password_reset_code_hash)")


def downgrade() -> None:
    # Best-effort downgrade (may fail if columns are used elsewhere).
    op.execute("DROP INDEX IF EXISTS ix_users_password_reset_code_hash")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_reset_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_reset_code_hash")

    op.execute("DROP INDEX IF EXISTS ix_users_telegram_link_code")
    op.execute("DROP INDEX IF EXISTS ix_users_telegram_chat_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS telegram_link_code_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS telegram_link_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS telegram_chat_id")


