"""add extra_roles array to users

Revision ID: 0160
Revises: 0159
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0160'
down_revision = '0159'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('extra_roles', postgresql.ARRAY(sa.String(32)), nullable=False, server_default='{}'),
    )


def downgrade():
    op.drop_column('users', 'extra_roles')
