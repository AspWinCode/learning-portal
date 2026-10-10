"""Official MAX links and asynchronous group broadcasts.

Revision ID: 0225
Revises: 0224
"""
import sqlalchemy as sa
from alembic import op

revision = "0225"
down_revision = "0224"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_messenger_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False, server_default="max"),
        sa.Column("external_chat_id", sa.String(64), nullable=False),
        sa.Column("external_chat_title", sa.String(512)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("connected_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_verified_at", sa.DateTime(timezone=True)),
        sa.Column("last_verification_status", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("group_id", "provider", name="uq_group_messenger_link_provider"),
        sa.UniqueConstraint("provider", "external_chat_id", name="uq_group_messenger_link_chat"),
    )
    op.create_index("ix_group_messenger_links_group_id", "group_messenger_links", ["group_id"])
    op.create_index("ix_group_messenger_links_provider", "group_messenger_links", ["provider"])
    op.create_index("ix_group_messenger_links_is_active", "group_messenger_links", ["is_active"])
    op.create_table(
        "max_broadcasts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False, server_default="max"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("total_targets", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "max_broadcast_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("broadcast_id", sa.Integer(), sa.ForeignKey("max_broadcasts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("external_chat_id", sa.String(64), nullable=False),
        sa.Column("chat_title", sa.String(512)),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("broadcast_id", "group_id", name="uq_max_broadcast_target_group"),
    )
    op.create_index("ix_max_broadcasts_created_by", "max_broadcasts", ["created_by"])
    op.create_index("ix_max_broadcasts_status", "max_broadcasts", ["status"])
    op.create_index("ix_max_broadcast_targets_broadcast_id", "max_broadcast_targets", ["broadcast_id"])
    op.create_index("ix_max_broadcast_targets_group_id", "max_broadcast_targets", ["group_id"])
    op.create_index("ix_max_broadcast_targets_status", "max_broadcast_targets", ["status"])


def downgrade() -> None:
    op.drop_table("max_broadcast_targets")
    op.drop_table("max_broadcasts")
    op.drop_table("group_messenger_links")
