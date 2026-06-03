"""Add school analytics fields to leads

Revision ID: 0012_add_school_analytics_fields_to_leads
Revises: 0011_add_event_capacity
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_add_school_analytics_fields_to_leads"
down_revision = "0011_add_event_capacity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("school_name", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("school_class", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("outreach_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("outreach_minutes", sa.Integer(), nullable=True))
    op.create_index("ix_leads_school_name", "leads", ["school_name"], unique=False, if_not_exists=True)
    op.create_index("ix_leads_school_class", "leads", ["school_class"], unique=False, if_not_exists=True)
    op.create_index("ix_leads_outreach_at", "leads", ["outreach_at"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_leads_outreach_at", table_name="leads")
    op.drop_index("ix_leads_school_class", table_name="leads")
    op.drop_index("ix_leads_school_name", table_name="leads")
    op.drop_column("leads", "outreach_minutes")
    op.drop_column("leads", "outreach_at")
    op.drop_column("leads", "school_class")
    op.drop_column("leads", "school_name")
