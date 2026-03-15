"""Add leads.max_user_id for MAX messenger.

Revision ID: 0074_lead_max_user_id
Revises: 0073_merge
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa


revision = "0074_lead_max_user_id"
down_revision = "0073_merge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("max_user_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_leads_max_user_id"), "leads", ["max_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_leads_max_user_id"), table_name="leads")
    op.drop_column("leads", "max_user_id")
