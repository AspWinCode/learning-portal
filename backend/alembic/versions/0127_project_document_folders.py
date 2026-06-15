"""project document folders

Revision ID: 0127_project_document_folders
Revises: 0126_owner_useful_links
Create Date: 2026-06-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0127_project_document_folders"
down_revision = "0126_owner_useful_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_project_document_folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_id"], ["owner_workspace_project_document_folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["owner_workspace_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_owner_workspace_project_document_folders_id"), "owner_workspace_project_document_folders", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_project_document_folders_project_id"), "owner_workspace_project_document_folders", ["project_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_project_document_folders_parent_id"), "owner_workspace_project_document_folders", ["parent_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_project_document_folders_created_at"), "owner_workspace_project_document_folders", ["created_at"], unique=False)

    op.add_column("owner_workspace_project_documents", sa.Column("folder_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_owner_workspace_project_documents_folder_id"), "owner_workspace_project_documents", ["folder_id"], unique=False)
    op.create_foreign_key(
        "fk_owner_workspace_project_documents_folder_id",
        "owner_workspace_project_documents",
        "owner_workspace_project_document_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_owner_workspace_project_documents_folder_id", "owner_workspace_project_documents", type_="foreignkey")
    op.drop_index(op.f("ix_owner_workspace_project_documents_folder_id"), table_name="owner_workspace_project_documents")
    op.drop_column("owner_workspace_project_documents", "folder_id")
    op.drop_index(op.f("ix_owner_workspace_project_document_folders_created_at"), table_name="owner_workspace_project_document_folders")
    op.drop_index(op.f("ix_owner_workspace_project_document_folders_parent_id"), table_name="owner_workspace_project_document_folders")
    op.drop_index(op.f("ix_owner_workspace_project_document_folders_project_id"), table_name="owner_workspace_project_document_folders")
    op.drop_index(op.f("ix_owner_workspace_project_document_folders_id"), table_name="owner_workspace_project_document_folders")
    op.drop_table("owner_workspace_project_document_folders")
