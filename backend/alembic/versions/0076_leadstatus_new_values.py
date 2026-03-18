"""Add missing leadstatus enum values

Revision ID: 0076_leadstatus_new_values
Revises: 0075_leads_missing_columns
Create Date: 2026-03-17

"""
from alembic import op
import sqlalchemy as sa


revision = "0076_leadstatus_new_values"
down_revision = "0075_leads_missing_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'no_answer'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'event_registered'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'decided_immediately'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'thinking'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly.
    # To downgrade, you would need to recreate the type without these values,
    # which requires migrating all data away from them first.
    pass
