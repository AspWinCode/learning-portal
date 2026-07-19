"""Add email_broadcasts and email_broadcast_recipients tables.

Revision ID: 0151_email_broadcasts
Revises: 0150_cms_page_versions
Create Date: 2026-07-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0151_email_broadcasts"
down_revision = "0150_cms_page_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_broadcasts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("plain_body", sa.Text(), nullable=True),
        # draft | sending | done | failed
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_recipients", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("opened_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_broadcasts_id", "email_broadcasts", ["id"])
    op.create_index("ix_email_broadcasts_status", "email_broadcasts", ["status"])
    op.create_index("ix_email_broadcasts_created_at", "email_broadcasts", ["created_at"])

    op.create_table(
        "email_broadcast_recipients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("broadcast_id", sa.Integer(), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("school_name", sa.String(length=255), nullable=True),
        sa.Column("director_name", sa.String(length=255), nullable=True),
        # pending | sending | sent | failed | opened
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("tracking_token", sa.String(length=64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("open_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["broadcast_id"], ["email_broadcasts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["b2b_schools.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ebr_broadcast_id", "email_broadcast_recipients", ["broadcast_id"])
    op.create_index("ix_ebr_school_id", "email_broadcast_recipients", ["school_id"])
    op.create_index("ix_ebr_status", "email_broadcast_recipients", ["status"])
    op.create_index("ix_ebr_tracking_token", "email_broadcast_recipients", ["tracking_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_ebr_tracking_token", table_name="email_broadcast_recipients")
    op.drop_index("ix_ebr_status", table_name="email_broadcast_recipients")
    op.drop_index("ix_ebr_school_id", table_name="email_broadcast_recipients")
    op.drop_index("ix_ebr_broadcast_id", table_name="email_broadcast_recipients")
    op.drop_table("email_broadcast_recipients")

    op.drop_index("ix_email_broadcasts_created_at", table_name="email_broadcasts")
    op.drop_index("ix_email_broadcasts_status", table_name="email_broadcasts")
    op.drop_index("ix_email_broadcasts_id", table_name="email_broadcasts")
    op.drop_table("email_broadcasts")
