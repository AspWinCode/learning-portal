"""add trip_shares table

Revision ID: 0167
Revises: 0166
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0167'
down_revision = '0166'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_shares',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('shared_with_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('can_edit', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id', 'shared_with_id', name='uq_trip_shares_trip_user'),
    )
    op.create_index('ix_trip_shares_id', 'trip_shares', ['id'])
    op.create_index('ix_trip_shares_trip_id', 'trip_shares', ['trip_id'])
    op.create_index('ix_trip_shares_shared_with_id', 'trip_shares', ['shared_with_id'])


def downgrade():
    op.drop_index('ix_trip_shares_shared_with_id', table_name='trip_shares')
    op.drop_index('ix_trip_shares_trip_id', table_name='trip_shares')
    op.drop_index('ix_trip_shares_id', table_name='trip_shares')
    op.drop_table('trip_shares')
