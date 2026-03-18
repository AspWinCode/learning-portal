"""0080: индекс на leads.city для фильтрации по городу

Revision ID: 0080
Revises: 0079
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_leads_city ON leads (city)"
    )


def downgrade() -> None:
    op.drop_index("ix_leads_city", table_name="leads")
