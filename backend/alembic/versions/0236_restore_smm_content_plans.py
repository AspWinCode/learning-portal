"""Restore editorial content plans for SMM projects.

Revision ID: 0236
Revises: 0235
"""

import sqlalchemy as sa
from alembic import op


revision = "0236"
down_revision = "0235"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smm_content_plans",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False, index=True),
        sa.Column("date_to", sa.Date(), nullable=False, index=True),
        sa.Column("objective", sa.Text(), nullable=True),
        sa.Column("audience", sa.Text(), nullable=True),
        sa.Column("channels", sa.JSON(), nullable=True),
        sa.Column("formats", sa.JSON(), nullable=True),
        sa.Column("posts_per_week", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "smm_content_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("smm_content_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("publish_date", sa.Date(), nullable=False, index=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rubric", sa.String(256), nullable=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("retention_mechanic", sa.Text(), nullable=True),
        sa.Column("content_format", sa.String(128), nullable=False, server_default="post"),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="planned", index=True),
        sa.Column("generated_content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column(
        "smm_content",
        sa.Column("plan_item_id", sa.Integer(), sa.ForeignKey("smm_content_plan_items.id", ondelete="SET NULL"), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("smm_content", "plan_item_id")
    op.drop_table("smm_content_plan_items")
    op.drop_table("smm_content_plans")
