"""Add seo_manager role and seo_pages table

Revision ID: 0143_seo_manager_role_and_pages
Revises: 0142_notes_table
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0143_seo_manager_role_and_pages"
down_revision = "0142_notes_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend userrole enum — must run outside the current transaction.
    conn = op.get_bind()
    conn.execute(sa.text("COMMIT"))
    conn.execute(sa.text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'seo_manager'"))

    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seopagestatus') THEN
                CREATE TYPE seopagestatus AS ENUM ('draft', 'published');
            END IF;
        END $$;
        """
    )

    seo_page_status_enum = sa.dialects.postgresql.ENUM(
        "draft", "published", name="seopagestatus", create_type=False
    )

    op.create_table(
        "seo_pages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("status", seo_page_status_enum, nullable=False, server_default="draft", index=True),
        sa.Column("h1", sa.String(255), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("seo_title", sa.String(255), nullable=True),
        sa.Column("seo_description", sa.String(500), nullable=True),
        sa.Column("canonical", sa.String(500), nullable=True),
        sa.Column("robots", sa.String(100), nullable=True),
        sa.Column("og_title", sa.String(255), nullable=True),
        sa.Column("og_description", sa.String(500), nullable=True),
        sa.Column("og_image", sa.String(500), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("seo_pages")
    op.execute("DROP TYPE IF EXISTS seopagestatus")
    # Note: cannot cleanly remove 'seo_manager' from userrole without recreating the
    # type; left as a no-op downgrade for this value (consistent with Postgres
    # limitations on removing enum values).
