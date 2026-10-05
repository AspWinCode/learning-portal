"""AI Studio Phase 2: content plan, group_key for multichannel/event-pack content

Revision ID: 0215
Revises: 0214
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0215"
down_revision = "0214"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_generated_content", sa.Column("group_key", sa.String(64), nullable=True))
    op.create_index("ix_ai_generated_content_group_key", "ai_generated_content", ["group_key"])

    op.create_table(
        "ai_content_plans",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "ai_content_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("ai_content_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("publish_date", sa.Date(), nullable=True, index=True),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("content_type", sa.String(64), nullable=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("generated_content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="idea", index=True),
    )


def downgrade() -> None:
    op.drop_table("ai_content_plan_items")
    op.drop_table("ai_content_plans")
    op.drop_index("ix_ai_generated_content_group_key", table_name="ai_generated_content")
    op.drop_column("ai_generated_content", "group_key")
