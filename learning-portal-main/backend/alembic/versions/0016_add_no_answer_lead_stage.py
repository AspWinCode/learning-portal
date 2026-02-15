"""Add no_answer lead status stage

Revision ID: 0016_add_no_answer_lead_stage
Revises: 0015_add_lead_status_options
Create Date: 2026-02-15
"""

from alembic import op


revision = "0016_add_no_answer_lead_stage"
down_revision = "0015_add_lead_status_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'no_answer'")
    op.execute(
        """
        INSERT INTO lead_statuses (name, base_status, is_active)
        SELECT 'Недозвон', 'no_answer', true
        WHERE NOT EXISTS (
            SELECT 1 FROM lead_statuses WHERE base_status = 'no_answer'
        )
        """
    )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values in-place safely.
    op.execute("DELETE FROM lead_statuses WHERE base_status = 'no_answer'")
