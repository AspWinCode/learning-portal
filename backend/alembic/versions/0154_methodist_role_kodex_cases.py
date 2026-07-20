"""add methodist role and kodex_cases table

Revision ID: 0154
Revises: 0153
Create Date: 2026-07-20
"""
from alembic import op
import sqlalchemy as sa

revision = '0154'
down_revision = '0153'
branch_labels = None
depends_on = None


def upgrade():
    # Add methodist to userrole enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'methodist'")

    # Create kodex_cases table
    op.create_table(
        'kodex_cases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(64), nullable=False),
        sa.Column('num', sa.String(32), nullable=True),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('curator', sa.String(128), nullable=True),
        sa.Column('playable', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('rank', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('difficulty', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('reward_credits', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reward_rep', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('goal', sa.Text(), nullable=True),
        sa.Column('suspects', sa.Text(), nullable=True),
        sa.Column('task', sa.Text(), nullable=True),
        sa.Column('anno', sa.Text(), nullable=True),
        sa.Column('briefing', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('materials', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('evidence', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('hints', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('versions', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('finale', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('theory', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_kodex_cases_id', 'kodex_cases', ['id'])
    op.create_index('ix_kodex_cases_slug', 'kodex_cases', ['slug'], unique=True)
    op.create_index('ix_kodex_cases_status', 'kodex_cases', ['status'])
    op.create_index('ix_kodex_cases_created_by_id', 'kodex_cases', ['created_by_id'])


def downgrade():
    op.drop_index('ix_kodex_cases_created_by_id', table_name='kodex_cases')
    op.drop_index('ix_kodex_cases_status', table_name='kodex_cases')
    op.drop_index('ix_kodex_cases_slug', table_name='kodex_cases')
    op.drop_index('ix_kodex_cases_id', table_name='kodex_cases')
    op.drop_table('kodex_cases')
    # Note: PostgreSQL does not support removing enum values; methodist stays in the type
