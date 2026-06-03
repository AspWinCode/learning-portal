"""Counterparties & projects redesign:
- add type to owner_workspace_contacts (company|ip|individual)
- add counterparty_id + deadline_at to owner_workspace_projects
- extend project statuses (new|in_progress|on_review|completed|archived)
- create owner_workspace_project_documents table

Revision ID: 0110_counterparties_projects_redesign
Revises: 0109_missing_tables
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0110_counterparties_projects_redesign"
down_revision = "0109_missing_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. owner_workspace_contacts: add type field
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("type", sa.String(32), nullable=False, server_default="company"),
    )

    # 2. owner_workspace_projects: add counterparty_id + deadline_at
    op.add_column(
        "owner_workspace_projects",
        sa.Column(
            "counterparty_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_owner_workspace_projects_counterparty_id",
        "owner_workspace_projects",
        ["counterparty_id"],
        unique=False,
        if_not_exists=True,
    )
    op.add_column(
        "owner_workspace_projects",
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Extend status: keep existing values; add new ones via server_default migration
    # (existing rows stay as-is; new rows use "new" by default)
    op.alter_column(
        "owner_workspace_projects",
        "status",
        existing_type=sa.String(20),
        new_column_name="status",
        existing_server_default="active",
        server_default="new",
        nullable=False,
    )

    # 3. owner_workspace_project_documents table
    op.create_table(
        "owner_workspace_project_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "uploaded_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ow_project_documents_id",
        "owner_workspace_project_documents",
        ["id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_ow_project_documents_project_id",
        "owner_workspace_project_documents",
        ["project_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_ow_project_documents_created_at",
        "owner_workspace_project_documents",
        ["created_at"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("owner_workspace_project_documents")
    op.drop_index("ix_owner_workspace_projects_counterparty_id", table_name="owner_workspace_projects")
    op.drop_column("owner_workspace_projects", "deadline_at")
    op.drop_column("owner_workspace_projects", "counterparty_id")
    op.alter_column(
        "owner_workspace_projects",
        "status",
        existing_type=sa.String(20),
        new_column_name="status",
        server_default="active",
        nullable=False,
    )
    op.drop_column("owner_workspace_contacts", "type")
