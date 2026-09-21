"""academy_ai: brand_visual_style on business profile (консистентность картинок)

Revision ID: 0193
Revises: 0192
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0193"
down_revision = "0192"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("academy_business_profile", sa.Column("brand_visual_style", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("academy_business_profile", "brand_visual_style")
