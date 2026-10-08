"""AI Studio refocused on consult/analyze: adds ai_dialogs/ai_messages, drops
the post-generation/autoposting tables that moved to the new smm_projects
module (0220). Dev-only data, never reached real publishing (no provider was
ever configured) — safe to drop outright rather than migrate.

Revision ID: 0221
Revises: 0220
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0221"
down_revision = "0220"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_dialogs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("dialog_id", sa.Integer(), sa.ForeignKey("ai_dialogs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("used_knowledge", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.drop_table("ai_publications")
    op.drop_table("ai_publish_logs")
    op.drop_table("ai_content_plan_items")
    op.drop_table("ai_content_plans")
    op.drop_constraint("fk_ai_generated_content_selected_asset", "ai_generated_content", type_="foreignkey")
    op.drop_table("ai_generated_assets")
    op.drop_table("ai_generated_content")
    op.drop_table("ai_content_templates")


def downgrade() -> None:
    # Обратная пересборка таблиц из 0214/0215/0216/0218/0219 — без восстановления данных.
    op.create_table(
        "ai_content_templates",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(64), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("prompt_template", sa.Text(), nullable=False),
        sa.Column("input_schema_json", sa.JSON(), nullable=True),
        sa.Column("output_format", sa.String(16), nullable=False, server_default="json"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.UniqueConstraint("workspace_id", "code", name="uq_ai_content_templates_workspace_code"),
    )
    op.create_table(
        "ai_generated_content",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("ai_content_templates.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("parent_content_id", sa.Integer(), nullable=True, index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("input_json", sa.JSON(), nullable=True),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("output_json", sa.JSON(), nullable=True),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", index=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("scheduled_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("group_key", sa.String(64), nullable=True, index=True),
        sa.Column("selected_asset_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "ai_generated_assets",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("asset_type", sa.String(32), nullable=False, server_default="image"),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("url", sa.String(1024), nullable=True),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), nullable=False, server_default="false", index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_foreign_key(
        "fk_ai_generated_content_selected_asset", "ai_generated_content", "ai_generated_assets", ["selected_asset_id"], ["id"], ondelete="SET NULL"
    )
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
    op.create_table(
        "ai_publish_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="error"),
        sa.Column("external_id", sa.String(256), nullable=True),
        sa.Column("external_url", sa.String(1024), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("published_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )
    op.create_table(
        "ai_publications",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False, index=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("ai_generated_assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("text_snapshot", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="approved", index=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("approved_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("external_id", sa.String(256), nullable=True),
        sa.Column("external_url", sa.String(1024), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.drop_table("ai_messages")
    op.drop_table("ai_dialogs")
