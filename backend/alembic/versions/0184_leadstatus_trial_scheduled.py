"""Add missing leadstatus enum values: trial_scheduled, refused

Revision ID: 0184
Revises: 0183
Create Date: 2026-09-05

The LeadStatus python enum gained TRIAL_SCHEDULED / REFUSED, but no migration
ever added them to the PostgreSQL ``leadstatus`` type. Moving a lead to
"Записали на пробное" issued ``UPDATE leads SET status = 'trial_scheduled'``
which failed with ``invalid input value for enum leadstatus``.
"""
from alembic import op
import sqlalchemy as sa


revision = "0184"
down_revision = "0183"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE must run outside the current transaction in PostgreSQL.
    conn = op.get_bind()
    conn.execute(sa.text("COMMIT"))
    conn.execute(sa.text("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'trial_scheduled'"))
    conn.execute(sa.text("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'refused'"))


def downgrade() -> None:
    # Enum values cannot be dropped in PostgreSQL without recreating the type.
    # Migrate affected rows to a safe default so a manual type rebuild is possible.
    op.execute("UPDATE leads SET status = 'new' WHERE status IN ('trial_scheduled', 'refused')")
