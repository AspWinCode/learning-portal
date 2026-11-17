"""Add owner_workspace_contact_folders and contacts.folder_id (one folder per contact)."""
from alembic import op
import sqlalchemy as sa

revision = "0245"
down_revision = "0244"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_contact_folders",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("folder_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_owner_workspace_contacts_folder_id",
        "owner_workspace_contacts",
        ["folder_id"],
    )
    op.create_foreign_key(
        "fk_owner_workspace_contacts_folder_id",
        "owner_workspace_contacts",
        "owner_workspace_contact_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_owner_workspace_contacts_folder_id", "owner_workspace_contacts", type_="foreignkey")
    op.drop_index("ix_owner_workspace_contacts_folder_id", table_name="owner_workspace_contacts")
    op.drop_column("owner_workspace_contacts", "folder_id")
    op.drop_table("owner_workspace_contact_folders")
