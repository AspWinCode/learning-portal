"""add geo and photo fields to trip_expenses

Revision ID: 0166
Revises: 0165
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0166'
down_revision = '0165'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trip_expenses', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('trip_expenses', sa.Column('longitude', sa.Float(), nullable=True))
    op.add_column('trip_expenses', sa.Column('photo_url', sa.String(1024), nullable=True))
    op.add_column('trip_expenses', sa.Column('place_name', sa.String(256), nullable=True))


def downgrade():
    op.drop_column('trip_expenses', 'place_name')
    op.drop_column('trip_expenses', 'photo_url')
    op.drop_column('trip_expenses', 'longitude')
    op.drop_column('trip_expenses', 'latitude')
