"""Add Google Contacts sync fields to owner_workspace_contacts.

One-way sync (Google -> system): Google owns full_name/phone/email/city,
the system owns company/position/responsible/status/tags/history. See
docs/google_contacts_sync.md for the field split and sync rules.
"""
from alembic import op
import sqlalchemy as sa

revision = "0244"
down_revision = "0243"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("owner_workspace_contacts", sa.Column("city", sa.String(length=255), nullable=True))
    op.add_column("owner_workspace_contacts", sa.Column("google_resource_name", sa.Text(), nullable=True))
    op.add_column("owner_workspace_contacts", sa.Column("google_etag", sa.Text(), nullable=True))
    op.add_column("owner_workspace_contacts", sa.Column("google_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("deleted_in_google", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("responsible_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
    )
    op.create_index(
        "ix_owner_workspace_contacts_google_resource_name",
        "owner_workspace_contacts",
        ["google_resource_name"],
        unique=True,
    )
    op.create_index(
        "ix_owner_workspace_contacts_responsible_id",
        "owner_workspace_contacts",
        ["responsible_id"],
    )
    op.create_index(
        "ix_owner_workspace_contacts_status",
        "owner_workspace_contacts",
        ["status"],
    )
    op.create_foreign_key(
        "fk_owner_workspace_contacts_responsible_id",
        "owner_workspace_contacts",
        "users",
        ["responsible_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_owner_workspace_contacts_responsible_id", "owner_workspace_contacts", type_="foreignkey")
    op.drop_index("ix_owner_workspace_contacts_status", table_name="owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_responsible_id", table_name="owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_google_resource_name", table_name="owner_workspace_contacts")
    op.drop_column("owner_workspace_contacts", "status")
    op.drop_column("owner_workspace_contacts", "responsible_id")
    op.drop_column("owner_workspace_contacts", "deleted_in_google")
    op.drop_column("owner_workspace_contacts", "google_synced_at")
    op.drop_column("owner_workspace_contacts", "google_etag")
    op.drop_column("owner_workspace_contacts", "google_resource_name")
    op.drop_column("owner_workspace_contacts", "city")
