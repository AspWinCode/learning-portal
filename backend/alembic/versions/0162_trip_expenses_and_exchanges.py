"""add trip expenses and cash exchanges tables

Revision ID: 0162
Revises: 0161
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0162'
down_revision = '0161'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_expenses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='other'),
        sa.Column('description', sa.String(512), nullable=True),
        sa.Column('amount_local', sa.Float(), nullable=False),
        sa.Column('local_currency', sa.String(3), nullable=False),
        sa.Column('exchange_rate', sa.Float(), nullable=False),
        sa.Column('amount_base', sa.Float(), nullable=False),
        sa.Column('base_currency', sa.String(3), nullable=False),
        sa.Column('occurred_at', sa.Date(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trip_expenses_id', 'trip_expenses', ['id'])
    op.create_index('ix_trip_expenses_trip_id', 'trip_expenses', ['trip_id'])
    op.create_index('ix_trip_expenses_category', 'trip_expenses', ['category'])

    op.create_table(
        'trip_cash_exchanges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount_base', sa.Float(), nullable=False),
        sa.Column('base_currency', sa.String(3), nullable=False),
        sa.Column('exchange_rate', sa.Float(), nullable=False),
        sa.Column('amount_local', sa.Float(), nullable=False),
        sa.Column('local_currency', sa.String(3), nullable=False),
        sa.Column('occurred_at', sa.Date(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trip_cash_exchanges_id', 'trip_cash_exchanges', ['id'])
    op.create_index('ix_trip_cash_exchanges_trip_id', 'trip_cash_exchanges', ['trip_id'])


def downgrade():
    op.drop_index('ix_trip_cash_exchanges_trip_id', table_name='trip_cash_exchanges')
    op.drop_index('ix_trip_cash_exchanges_id', table_name='trip_cash_exchanges')
    op.drop_table('trip_cash_exchanges')
    op.drop_index('ix_trip_expenses_category', table_name='trip_expenses')
    op.drop_index('ix_trip_expenses_trip_id', table_name='trip_expenses')
    op.drop_index('ix_trip_expenses_id', table_name='trip_expenses')
    op.drop_table('trip_expenses')
