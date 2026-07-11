"""Add blog categories, tags and posts tables

Revision ID: 0144_blog_tables
Revises: 0143_seo_manager_role_and_pages
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0144_blog_tables"
down_revision = "0143_seo_manager_role_and_pages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blogpoststatus') THEN
                CREATE TYPE blogpoststatus AS ENUM ('draft', 'published');
            END IF;
        END $$;
        """
    )

    blog_post_status_enum = sa.dialects.postgresql.ENUM(
        "draft", "published", name="blogpoststatus", create_type=False
    )

    op.create_table(
        "blog_categories",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "blog_tags",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("status", blog_post_status_enum, nullable=False, server_default="draft", index=True),
        sa.Column("excerpt", sa.String(500), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("cover_image", sa.String(500), nullable=True),
        sa.Column("seo_title", sa.String(255), nullable=True),
        sa.Column("seo_description", sa.String(500), nullable=True),
        sa.Column("og_title", sa.String(255), nullable=True),
        sa.Column("og_description", sa.String(500), nullable=True),
        sa.Column("og_image", sa.String(500), nullable=True),
        sa.Column("canonical", sa.String(500), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("blog_categories.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        "blog_post_tags",
        sa.Column("blog_post_id", sa.Integer(), sa.ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blog_tag_id", sa.Integer(), sa.ForeignKey("blog_tags.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("blog_post_tags")
    op.drop_table("blog_posts")
    op.drop_table("blog_tags")
    op.drop_table("blog_categories")
    op.execute("DROP TYPE IF EXISTS blogpoststatus")
