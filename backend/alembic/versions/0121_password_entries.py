"""password entries vault

Revision ID: 0121_password_entries
Revises: 0120_owner_workspace_project_start_at
Create Date: 2026-06-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0121_password_entries"
down_revision = "0120_owner_workspace_project_start_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("login", sa.String(length=255), nullable=True),
        sa.Column("encrypted_password", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_password_entries_id"), "password_entries", ["id"], unique=False)
    op.create_index(op.f("ix_password_entries_name"), "password_entries", ["name"], unique=False)
    op.create_index(op.f("ix_password_entries_login"), "password_entries", ["login"], unique=False)
    op.create_index(op.f("ix_password_entries_owner_id"), "password_entries", ["owner_id"], unique=False)
    op.create_index(op.f("ix_password_entries_created_at"), "password_entries", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_password_entries_created_at"), table_name="password_entries")
    op.drop_index(op.f("ix_password_entries_owner_id"), table_name="password_entries")
    op.drop_index(op.f("ix_password_entries_login"), table_name="password_entries")
    op.drop_index(op.f("ix_password_entries_name"), table_name="password_entries")
    op.drop_index(op.f("ix_password_entries_id"), table_name="password_entries")
    op.drop_table("password_entries")

