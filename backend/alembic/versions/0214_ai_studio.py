"""AI Studio: generic multi-workspace layer over ai_gateway (academy + kodarena)

Does not touch academy_* tables — Academy AI keeps its own contour. Seeds two
workspaces (academy as a catalog placeholder, kodarena with empty brand
profile for the owner to fill in) and three starter templates for kodarena.

Revision ID: 0214
Revises: 6a8ae715f8d8
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0214"
down_revision = "6a8ae715f8d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_workspaces",
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
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "ai_workspace_access",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("role", sa.String(32), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "ai_knowledge_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
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
        sa.Column("parent_content_id", sa.Integer(), sa.ForeignKey("ai_generated_content.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("input_json", sa.JSON(), nullable=True),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", index=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("scheduled_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    ai_workspaces = sa.table(
        "ai_workspaces",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("default_language", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        ai_workspaces,
        [
            {
                "code": "academy",
                "name": "Академия",
                "description": "ИИ-консультант академии (существующий модуль, см. /academy-ai).",
                "default_language": "ru",
                "is_active": True,
            },
            {
                "code": "kodarena",
                "name": "КодАрена",
                "description": None,
                "default_language": "ru",
                "is_active": True,
            },
        ],
    )

    conn = op.get_bind()
    kodarena_id = conn.execute(
        sa.text("SELECT id FROM ai_workspaces WHERE code = 'kodarena'")
    ).scalar_one()

    ai_content_templates = sa.table(
        "ai_content_templates",
        sa.column("workspace_id", sa.Integer),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("prompt_template", sa.Text),
        sa.column("input_schema_json", sa.JSON),
        sa.column("output_format", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        ai_content_templates,
        [
            {
                "workspace_id": kodarena_id,
                "code": "social_post",
                "name": "Пост для соцсетей",
                "description": "Пост для VK/Telegram/универсальный под тему и цель.",
                "prompt_template": (
                    "Напиши пост для соцсети на основе задания. Площадка: {platform}. "
                    "Аудитория: {audience}. Цель: {goal}. CTA: {cta}. Длина: {length}.\n\n"
                    "Тема и факты: {topic}"
                ),
                "input_schema_json": {
                    "fields": [
                        {"key": "topic", "label": "Тема", "type": "text", "required": True},
                        {"key": "goal", "label": "Цель", "type": "text"},
                        {"key": "platform", "label": "Площадка", "type": "select",
                         "options": ["vk", "telegram", "universal", "short"]},
                        {"key": "audience", "label": "Аудитория", "type": "text"},
                        {"key": "cta", "label": "CTA", "type": "text"},
                        {"key": "length", "label": "Длина", "type": "select",
                         "options": ["короткий", "средний", "длинный"]},
                    ]
                },
                "output_format": "json",
                "sort_order": 10,
            },
            {
                "workspace_id": kodarena_id,
                "code": "event_announcement",
                "name": "Анонс мероприятия",
                "description": "Анонс события: дата, место, возраст, формат, стоимость, CTA.",
                "prompt_template": (
                    "Составь анонс мероприятия. Название: {title}. Дата: {date}. Время: {time}. "
                    "Место: {location}. Возраст: {age}. Формат: {format}. Стоимость: {price}. "
                    "Ссылка: {link}. CTA: {cta}.\n\n"
                    "Если какого-то из этих фактов нет — напиши [уточнить ...], не придумывай."
                ),
                "input_schema_json": {
                    "fields": [
                        {"key": "title", "label": "Название", "type": "text", "required": True},
                        {"key": "date", "label": "Дата", "type": "text"},
                        {"key": "time", "label": "Время", "type": "text"},
                        {"key": "location", "label": "Место", "type": "text"},
                        {"key": "age", "label": "Возраст", "type": "text"},
                        {"key": "format", "label": "Формат", "type": "text"},
                        {"key": "price", "label": "Стоимость", "type": "text"},
                        {"key": "link", "label": "Ссылка", "type": "text"},
                        {"key": "cta", "label": "CTA", "type": "text"},
                    ]
                },
                "output_format": "json",
                "sort_order": 20,
            },
            {
                "workspace_id": kodarena_id,
                "code": "email",
                "name": "Email / рассылка",
                "description": "Письмо родителям/участникам/школам/партнёрам.",
                "prompt_template": (
                    "Напиши письмо для рассылки. Адресат: {audience_type}. Тема письма: {topic}. "
                    "Ключевые факты: {facts}. CTA: {cta}."
                ),
                "input_schema_json": {
                    "fields": [
                        {"key": "audience_type", "label": "Адресат", "type": "select",
                         "options": ["parents", "participants", "schools", "partners", "prospects"],
                         "required": True},
                        {"key": "topic", "label": "Тема письма", "type": "text", "required": True},
                        {"key": "facts", "label": "Ключевые факты", "type": "text"},
                        {"key": "cta", "label": "CTA", "type": "text"},
                    ]
                },
                "output_format": "json",
                "sort_order": 30,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("ai_generated_content")
    op.drop_table("ai_content_templates")
    op.drop_table("ai_knowledge_items")
    op.drop_table("ai_workspace_access")
    op.drop_table("ai_workspaces")
