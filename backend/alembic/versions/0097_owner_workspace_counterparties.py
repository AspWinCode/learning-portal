"""owner workspace counterparties

Revision ID: 0097_owner_workspace_counterparties
Revises: 0096_person_registry_phase2
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0097_owner_workspace_counterparties"
down_revision = "0096_person_registry_phase2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("owner_workspace_contacts", sa.Column("custom_fields", sa.JSON(), nullable=True))
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("owner_workspace_contacts", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("owner_workspace_contacts", "phone", existing_type=sa.String(length=64), nullable=True)
    op.create_index("ix_owner_workspace_contacts_is_archived", "owner_workspace_contacts", ["is_archived"], unique=False)
    op.create_index("ix_owner_workspace_contacts_archived_at", "owner_workspace_contacts", ["archived_at"], unique=False)

    op.create_table(
        "owner_workspace_counterparty_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.UniqueConstraint(
            "contact_id",
            "category",
            name="uq_owner_workspace_counterparty_document_contact_category",
        ),
    )
    op.create_index(
        "ix_owner_workspace_counterparty_documents_contact_id",
        "owner_workspace_counterparty_documents",
        ["contact_id"],
        unique=False,
    )
    op.create_index(
        "ix_owner_workspace_counterparty_documents_category",
        "owner_workspace_counterparty_documents",
        ["category"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_owner_workspace_counterparty_documents_category", table_name="owner_workspace_counterparty_documents")
    op.drop_index("ix_owner_workspace_counterparty_documents_contact_id", table_name="owner_workspace_counterparty_documents")
    op.drop_table("owner_workspace_counterparty_documents")
    op.drop_index("ix_owner_workspace_contacts_archived_at", table_name="owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_is_archived", table_name="owner_workspace_contacts")
    op.alter_column("owner_workspace_contacts", "phone", existing_type=sa.String(length=64), nullable=False)
    op.drop_column("owner_workspace_contacts", "archived_at")
    op.drop_column("owner_workspace_contacts", "is_archived")
    op.drop_column("owner_workspace_contacts", "custom_fields")

