"""SMM-проекты: отдельный модуль автопостинга (Project, не привязан к
AiWorkspace). Content/assets/publications/publish_logs переносятся сюда из
ai_studio в следующей миграции (0221), которая и дропает старые таблицы.

Revision ID: 0220
Revises: 0219
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0220"
down_revision = "0219"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smm_projects",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("tone_of_voice", sa.Text(), nullable=True),
        sa.Column("audience_description", sa.Text(), nullable=True),
        sa.Column("brand_context", sa.JSON(), nullable=True),
        sa.Column("default_language", sa.String(16), nullable=False, server_default="ru"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "smm_project_access",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("role", sa.String(32), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "smm_knowledge_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("source_url", sa.String(1024), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "smm_content_templates",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
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
        sa.UniqueConstraint("project_id", "code", name="uq_smm_content_templates_project_code"),
    )
    op.create_table(
        "smm_channel_configs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.UniqueConstraint("project_id", "channel", name="uq_smm_channel_configs_project_channel"),
    )
    op.create_table(
        "smm_content_plans",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("periodicity", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "smm_content",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("smm_content_templates.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("plan_item_id", sa.Integer(), nullable=True, index=True),
        sa.Column("parent_content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="SET NULL"), nullable=True, index=True),
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
        sa.Column("group_key", sa.String(64), nullable=True, index=True),
        sa.Column("selected_asset_id", sa.Integer(), nullable=True),
        sa.Column("auto_generated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "smm_content_assets",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="CASCADE"), nullable=False, index=True),
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
        "fk_smm_content_selected_asset", "smm_content", "smm_content_assets", ["selected_asset_id"], ["id"], ondelete="SET NULL"
    )
    op.create_table(
        "smm_content_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("smm_content_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("content_type", sa.String(64), nullable=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("generated_content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_foreign_key(
        "fk_smm_content_plan_item", "smm_content", "smm_content_plan_items", ["plan_item_id"], ["id"], ondelete="SET NULL"
    )
    op.create_table(
        "smm_publications",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False, index=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("smm_content_assets.id", ondelete="SET NULL"), nullable=True),
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
    op.create_table(
        "smm_publish_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="error"),
        sa.Column("external_id", sa.String(256), nullable=True),
        sa.Column("external_url", sa.String(1024), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("published_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("smm_publish_logs")
    op.drop_table("smm_publications")
    op.drop_constraint("fk_smm_content_plan_item", "smm_content", type_="foreignkey")
    op.drop_table("smm_content_plan_items")
    op.drop_constraint("fk_smm_content_selected_asset", "smm_content", type_="foreignkey")
    op.drop_table("smm_content_assets")
    op.drop_table("smm_content")
    op.drop_table("smm_content_plans")
    op.drop_table("smm_channel_configs")
    op.drop_table("smm_content_templates")
    op.drop_table("smm_knowledge_items")
    op.drop_table("smm_project_access")
    op.drop_table("smm_projects")
