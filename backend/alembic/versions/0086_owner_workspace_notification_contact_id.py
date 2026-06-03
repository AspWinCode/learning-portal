"""0086: optional contact_id on owner workspace notifications

Revision ID: 0086_owner_workspace_notification_contact_id
Revises: 0085_owner_workspace_conversation_reads
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0086_owner_workspace_notification_contact_id"
down_revision = "0085_owner_workspace_conversation_reads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_notifications",
        sa.Column(
            "contact_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_owner_workspace_notifications_contact_id",
        "owner_workspace_notifications",
        ["contact_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_owner_workspace_notifications_contact_id", table_name="owner_workspace_notifications")
    op.drop_column("owner_workspace_notifications", "contact_id")
