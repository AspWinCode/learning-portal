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
    # Add new enum value for PostgreSQL userrole type.
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'owner'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values without recreating the type.
    pass

