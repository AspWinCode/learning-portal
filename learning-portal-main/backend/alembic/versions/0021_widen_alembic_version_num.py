"""Widen alembic_version.version_num for long revision IDs

Revision ID: 0021_widen_alembic_version_num
Revises: 0020_b2b_projects_and_school_city
Create Date: 2026-02-16

"""
from alembic import op

revision = "0021_widen_alembic_version_num"
down_revision = "0020_b2b_projects_and_school_city"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)")


def downgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(32)")
