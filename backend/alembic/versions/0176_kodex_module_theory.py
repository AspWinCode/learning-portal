"""add kodex_module_theory table

Revision ID: 0176
Revises: 0175
Create Date: 2026-08-22
"""
from alembic import op
import sqlalchemy as sa

revision = '0176'
down_revision = '0175'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'kodex_module_theory',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('module', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(512), nullable=False, server_default=''),
        sa.Column('content_md', sa.Text(), nullable=False, server_default=''),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_kodex_module_theory_id', 'kodex_module_theory', ['id'])
    op.create_index('ix_kodex_module_theory_module', 'kodex_module_theory', ['module'], unique=True)


def downgrade():
    op.drop_index('ix_kodex_module_theory_module', table_name='kodex_module_theory')
    op.drop_index('ix_kodex_module_theory_id', table_name='kodex_module_theory')
    op.drop_table('kodex_module_theory')
