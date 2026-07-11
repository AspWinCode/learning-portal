"""Add media_files table

Revision ID: 0145_media_files
Revises: 0144_blog_tables
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0145_media_files"
down_revision = "0144_blog_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_files",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("size", sa.Integer, nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
        sa.Column(
            "uploaded_by_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("media_files")
