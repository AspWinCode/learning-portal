"""add trips module

Revision ID: 0161
Revises: 0160
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0161'
down_revision = '0160'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trips',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('country', sa.String(128), nullable=True),
        sa.Column('city', sa.String(128), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('base_currency', sa.String(3), nullable=False, server_default='RUB'),
        sa.Column('local_currency', sa.String(3), nullable=False, server_default='THB'),
        sa.Column('status', sa.String(20), nullable=False, server_default='planned'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trips_id', 'trips', ['id'])
    op.create_index('ix_trips_owner_id', 'trips', ['owner_id'])
    op.create_index('ix_trips_status', 'trips', ['status'])

    op.add_column(
        'finance_transactions',
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_finance_transactions_trip_id', 'finance_transactions', ['trip_id'])


def downgrade():
    op.drop_index('ix_finance_transactions_trip_id', table_name='finance_transactions')
    op.drop_column('finance_transactions', 'trip_id')
    op.drop_index('ix_trips_status', table_name='trips')
    op.drop_index('ix_trips_owner_id', table_name='trips')
    op.drop_index('ix_trips_id', table_name='trips')
    op.drop_table('trips')
