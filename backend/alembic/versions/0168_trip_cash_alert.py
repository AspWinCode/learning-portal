"""add cash_alert_threshold to trips

Revision ID: 0168
Revises: 0167
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0168'
down_revision = '0167'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trips', sa.Column('cash_alert_threshold', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('trips', 'cash_alert_threshold')
