"""add trip_checklist_items table

Revision ID: 0165
Revises: 0164
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = '0165'
down_revision = '0164'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_checklist_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='other'),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('is_done', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trip_checklist_items_id', 'trip_checklist_items', ['id'])
    op.create_index('ix_trip_checklist_items_trip_id', 'trip_checklist_items', ['trip_id'])


def downgrade():
    op.drop_index('ix_trip_checklist_items_trip_id', table_name='trip_checklist_items')
    op.drop_index('ix_trip_checklist_items_id', table_name='trip_checklist_items')
    op.drop_table('trip_checklist_items')
