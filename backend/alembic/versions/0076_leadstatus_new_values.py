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
    # Migrate leads using the removed values to a safe default, then recreate the enum.
    op.execute("""
        UPDATE leads SET status = 'new'
        WHERE status IN ('no_answer', 'event_registered', 'decided_immediately', 'thinking')
    """)
    op.execute("ALTER TABLE leads ALTER COLUMN status TYPE text USING status::text")
    op.execute("DROP TYPE IF EXISTS leadstatus")
    op.execute("""
        CREATE TYPE leadstatus AS ENUM ('new', 'contacted', 'demo', 'invoice_sent', 'won', 'lost')
    """)
    op.execute("ALTER TABLE leads ALTER COLUMN status TYPE leadstatus USING status::leadstatus")
