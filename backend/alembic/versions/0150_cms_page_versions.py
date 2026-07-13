"""cms_page_versions: version history for CMS pages (draft / published)

Revision ID: 0150_cms_page_versions
Revises: 0149_note_folders
Create Date: 2026-07-13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON

revision = "0150_cms_page_versions"
down_revision = "0149_note_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cms_page_versions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "page_id",
            sa.Integer,
            sa.ForeignKey("cms_pages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("content", JSON, nullable=False, server_default="{}"),
        # "draft" | "published"
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "created_by_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    # fast lookup: latest draft / published per page
    op.create_index(
        "ix_cms_page_versions_page_status",
        "cms_page_versions",
        ["page_id", "status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_cms_page_versions_page_status", table_name="cms_page_versions")
    op.drop_table("cms_page_versions")
