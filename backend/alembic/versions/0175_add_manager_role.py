"""add manager role

Revision ID: 0175
Revises: 0174
Create Date: 2026-08-21
"""

from alembic import op

revision = "0175"
down_revision = "0174"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'manager'")


def downgrade() -> None:
    pass
