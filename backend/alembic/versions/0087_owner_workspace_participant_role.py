"""0087: role on owner_workspace_project_participants (member | manager)

Revision ID: 0087_owner_workspace_participant_role
Revises: 0086_owner_workspace_notification_contact_id
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0087_owner_workspace_participant_role"
down_revision = "0086_owner_workspace_notification_contact_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_project_participants",
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
    )
    op.alter_column(
        "owner_workspace_project_participants",
        "role",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("owner_workspace_project_participants", "role")
