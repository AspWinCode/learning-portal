"""add trip_itinerary_items table

Revision ID: 0164
Revises: 0163
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0164'
down_revision = '0163'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_itinerary_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('day_date', sa.Date(), nullable=False),
        sa.Column('time_of_day', sa.String(10), nullable=True),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=False, server_default='other'),
        sa.Column('estimated_cost', sa.Float(), nullable=True),
        sa.Column('actual_expense_id', sa.Integer(), sa.ForeignKey('trip_expenses.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='planned'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trip_itinerary_items_id', 'trip_itinerary_items', ['id'])
    op.create_index('ix_trip_itinerary_items_trip_id', 'trip_itinerary_items', ['trip_id'])
    op.create_index('ix_trip_itinerary_items_day_date', 'trip_itinerary_items', ['day_date'])


def downgrade():
    op.drop_index('ix_trip_itinerary_items_day_date', table_name='trip_itinerary_items')
    op.drop_index('ix_trip_itinerary_items_trip_id', table_name='trip_itinerary_items')
    op.drop_index('ix_trip_itinerary_items_id', table_name='trip_itinerary_items')
    op.drop_table('trip_itinerary_items')
