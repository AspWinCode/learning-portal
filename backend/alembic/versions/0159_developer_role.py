"""add developer role

Revision ID: 0159
Revises: 0158
Create Date: 2026-08-01
"""
from alembic import op

revision = '0159'
down_revision = '0158'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'developer'")


def downgrade():
    pass
