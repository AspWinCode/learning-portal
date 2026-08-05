"""add trip_budgets table

Revision ID: 0163
Revises: 0162
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0163'
down_revision = '0162'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_budgets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='total'),
        sa.Column('amount_local', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id', 'category', name='uq_trip_budgets_trip_category'),
    )
    op.create_index('ix_trip_budgets_id', 'trip_budgets', ['id'])
    op.create_index('ix_trip_budgets_trip_id', 'trip_budgets', ['trip_id'])


def downgrade():
    op.drop_index('ix_trip_budgets_trip_id', table_name='trip_budgets')
    op.drop_index('ix_trip_budgets_id', table_name='trip_budgets')
    op.drop_table('trip_budgets')
