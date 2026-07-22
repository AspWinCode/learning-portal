"""Add email_broadcast_attachments table.

Revision ID: 0153_email_broadcast_attachments
Revises: 0152_email_templates
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "0153_email_broadcast_attachments"
down_revision = "0152_email_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_broadcast_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("broadcast_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["broadcast_id"], ["email_broadcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_eba_id", "email_broadcast_attachments", ["id"])
    op.create_index("ix_eba_broadcast_id", "email_broadcast_attachments", ["broadcast_id"])


def downgrade() -> None:
    op.drop_index("ix_eba_broadcast_id", table_name="email_broadcast_attachments")
    op.drop_index("ix_eba_id", table_name="email_broadcast_attachments")
    op.drop_table("email_broadcast_attachments")
