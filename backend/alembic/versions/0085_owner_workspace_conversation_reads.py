"""0085: per-user read cursor for owner workspace dialogues

Revision ID: 0085_owner_workspace_conversation_reads
Revises: 0084_owner_workspace_user_preferences
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0085_owner_workspace_conversation_reads"
down_revision = "0084_owner_workspace_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_conversation_reads",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "contact_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "contact_id", name="pk_owner_workspace_conversation_reads"),
    )
    op.create_index(
        "ix_owner_workspace_conversation_reads_user_id",
        "owner_workspace_conversation_reads",
        ["user_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_owner_workspace_conversation_reads_user_id", table_name="owner_workspace_conversation_reads")
    op.drop_table("owner_workspace_conversation_reads")
