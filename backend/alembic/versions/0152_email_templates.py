"""Add email_templates table.

Revision ID: 0152_email_templates
Revises: 0151_email_broadcasts
Create Date: 2026-07-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0152_email_templates"
down_revision = "0151_email_broadcasts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("plain_body", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_templates_id", "email_templates", ["id"])
    op.create_index("ix_email_templates_created_at", "email_templates", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_email_templates_created_at", table_name="email_templates")
    op.drop_index("ix_email_templates_id", table_name="email_templates")
    op.drop_table("email_templates")
