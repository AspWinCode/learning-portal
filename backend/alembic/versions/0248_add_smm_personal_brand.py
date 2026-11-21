"""Add the isolated personal brand SMM workspace.

Revision ID: 0248
Revises: 0247
"""
import sqlalchemy as sa
from alembic import op

revision = "0248"
down_revision = "0247"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    project_id = bind.execute(
        sa.text("SELECT id FROM smm_projects WHERE code = 'lichny_brand'")
    ).scalar_one_or_none()
    if project_id is None:
        project_id = bind.execute(
            sa.text(
                "INSERT INTO smm_projects (code, name, description, default_language, is_active) "
                "VALUES ('lichny_brand', 'Личный бренд', "
                "'Личные публикации и контент для собственных социальных сетей.', 'ru', true) "
                "RETURNING id"
            )
        ).scalar_one()

    exists = bind.execute(
        sa.text(
            "SELECT 1 FROM smm_content_templates "
            "WHERE project_id = :project_id AND code = 'social_post'"
        ),
        {"project_id": project_id},
    ).first()
    if not exists:
        templates = sa.table(
            "smm_content_templates",
            sa.column("project_id", sa.Integer()),
            sa.column("code", sa.String()),
            sa.column("name", sa.String()),
            sa.column("description", sa.Text()),
            sa.column("prompt_template", sa.Text()),
            sa.column("input_schema_json", sa.JSON()),
            sa.column("output_format", sa.String()),
            sa.column("sort_order", sa.Integer()),
        )
        op.bulk_insert(templates, [{
            "project_id": project_id,
            "code": "social_post",
            "name": "Пост для соцсетей",
            "description": "Пост под тему, площадку и цель публикации.",
            "prompt_template": (
                "Напиши пост для личных социальных сетей. Площадка: {platform}. "
                "Аудитория: {audience}. Цель: {goal}. Тема и факты: {topic}. "
                "CTA: {cta}. Длина: {length}. Используй только контекст проекта и "
                "разрешённые для личного бренда источники."
            ),
            "input_schema_json": {"fields": [
                {"key": "topic", "label": "Тема", "type": "text", "required": True},
                {"key": "goal", "label": "Цель", "type": "text"},
                {"key": "platform", "label": "Площадка", "type": "select", "options": ["vk", "telegram", "instagram", "max", "universal"]},
                {"key": "audience", "label": "Аудитория", "type": "text"},
                {"key": "cta", "label": "CTA", "type": "text"},
                {"key": "length", "label": "Длина", "type": "select", "options": ["короткий", "средний", "длинный"]},
            ]},
            "output_format": "json",
            "sort_order": 10,
        }])


def downgrade() -> None:
    # Preserve any content, references, and settings created after deployment.
    pass
