"""Add cms_pages table for landing site content management

Revision ID: 0148_cms_pages
Revises: 0147_site_settings
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "0148_cms_pages"
down_revision = "0147_site_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cms_pages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("content", JSON, nullable=False, server_default="{}"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("cms_pages")
