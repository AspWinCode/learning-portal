"""add online_url to groups and custom_lessons

Revision ID: 0153
Revises: 0152
Create Date: 2026-07-19
"""
from alembic import op
import sqlalchemy as sa

revision = '0153'
down_revision = '0152_email_templates'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('groups', sa.Column('online_url', sa.String(1024), nullable=True))
    op.add_column('custom_lessons', sa.Column('online_url', sa.String(1024), nullable=True))


def downgrade():
    op.drop_column('groups', 'online_url')
    op.drop_column('custom_lessons', 'online_url')
