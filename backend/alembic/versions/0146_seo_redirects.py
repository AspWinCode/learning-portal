"""Add seo_redirects table

Revision ID: 0146_seo_redirects
Revises: 0145_media_files
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0146_seo_redirects"
down_revision = "0145_media_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "seo_redirects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("from_path", sa.String(500), nullable=False, unique=True, index=True),
        sa.Column("to_url", sa.String(500), nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False, server_default="301"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("seo_redirects")
