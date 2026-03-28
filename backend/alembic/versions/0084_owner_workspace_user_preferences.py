"""0084: owner workspace per-user UI preferences

Revision ID: 0084_owner_workspace_user_preferences
Revises: 0083_owner_workspace_notifications
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0084_owner_workspace_user_preferences"
down_revision = "0083_owner_workspace_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_user_preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("preferences", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("owner_workspace_user_preferences")
