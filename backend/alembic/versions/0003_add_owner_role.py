"""Add owner role to userrole enum

Revision ID: 0003_add_owner_role
Revises: 0002_app_settings_logo
Create Date: 2026-01-27
"""

from alembic import op

revision = "0003_add_owner_role"
down_revision = "0002_app_settings_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must run outside the current transaction in PostgreSQL
    # because the new enum value cannot be used in the same txn it was added in.
    conn = op.get_bind()
    conn.execute(__import__("sqlalchemy").text("COMMIT"))
    conn.execute(__import__("sqlalchemy").text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'owner'"))


def downgrade() -> None:
    # Reassign any 'owner' users to 'admin', then recreate the enum without 'owner'.
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'owner'")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE text USING role::text")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("CREATE TYPE userrole AS ENUM ('admin', 'trainer', 'parent', 'guest')")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole")

