"""Add pipeline statuses and no_answer_attempt to leads

Revision ID: 0024_pipeline_statuses_and_no_answer_attempt
Revises: 0023_add_sales_schools
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0024_pipeline_statuses_and_no_answer_attempt"
down_revision = "0023_add_sales_schools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'thinking'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'refused'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'trial_scheduled'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'event_registered'")
    op.execute("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'decided_immediately'")
    op.add_column("leads", sa.Column("no_answer_attempt", sa.Integer(), nullable=True))
    op.create_index("ix_leads_no_answer_attempt", "leads", ["no_answer_attempt"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leads_no_answer_attempt", table_name="leads")
    op.drop_column("leads", "no_answer_attempt")
    # PostgreSQL does not support removing enum values easily; leave new values in type