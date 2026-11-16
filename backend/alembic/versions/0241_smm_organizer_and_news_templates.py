"""Backfill organizer-reflection and programming/gamedev-news SMM templates.

New SmmProject rows pick these up from DEFAULT_TEMPLATES (templates.py) via
seed_defaults() at creation time; this migration adds them to projects that
already existed before these two templates were introduced. Idempotent —
skips any (project_id, code) pair that already exists.
"""
from alembic import op
import sqlalchemy as sa

revision = "0241"
down_revision = "0240"
branch_labels = None
depends_on = None


NEW_TEMPLATES = [
    {
        "code": "organizer_thoughts",
        "name": "Размышления организаторов",
        "description": (
            "Личный пост от лица организаторов КодАрены — размышление на тему, "
            "близкую программированию и разработке, без привязки к конкретному "
            "анонсу или новости. Это мнение, а не объявление о событии."
        ),
        "prompt_template": (
            "Напиши пост от лица организаторов КодАрены в формате личного размышления "
            "на тему, близкую программированию и разработке. Тема: {topic}. "
            "Главная мысль, которую хотим донести: {thesis}. Тон: {tone}. Длина: {length}.\n\n"
            "Это мнение/рассуждение, а не анонс события — не придумывай факты о "
            "турнирах, датах или цифрах, которых нет в контексте проекта."
        ),
        "input_schema_json": {
            "fields": [
                {"key": "topic", "label": "Тема", "type": "text", "required": True},
                {"key": "thesis", "label": "Главная мысль", "type": "text"},
                {"key": "tone", "label": "Тон", "type": "select",
                 "options": ["личный", "философский", "провокационный", "мотивирующий", "с юмором"]},
                {"key": "length", "label": "Длина", "type": "select", "options": ["короткий", "средний", "длинный"]},
            ]
        },
        "output_format": "json",
        "sort_order": 40,
    },
    {
        "code": "programming_news",
        "name": "Новости программирования и геймдева",
        "description": (
            "Новостной пост на стыке программирования и разработки игр — показывает "
            "экспертизу КодАрены в индустрии. Опирается строго на переданные факты "
            "новости, ничего не домысливает сверх источника."
        ),
        "prompt_template": (
            "Напиши новостной пост для соцсетей на стыке программирования и разработки игр. "
            "Новость: {news_topic}. Почему это важно нашей аудитории (школьники и студенты, "
            "изучающие программирование): {relevance}. Источник: {source}.\n\n"
            "Факты строго из источника, не домысливай: {facts}"
        ),
        "input_schema_json": {
            "fields": [
                {"key": "news_topic", "label": "Новость", "type": "text", "required": True},
                {"key": "facts", "label": "Факты из источника", "type": "text", "required": True},
                {"key": "relevance", "label": "Почему это важно аудитории", "type": "text"},
                {"key": "source", "label": "Источник", "type": "text"},
            ]
        },
        "output_format": "json",
        "sort_order": 50,
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    project_ids = [row.id for row in bind.execute(sa.text("SELECT id FROM smm_projects"))]
    existing = {
        (row.project_id, row.code)
        for row in bind.execute(sa.text("SELECT project_id, code FROM smm_content_templates"))
    }
    rows = []
    for project_id in project_ids:
        for spec in NEW_TEMPLATES:
            if (project_id, spec["code"]) in existing:
                continue
            rows.append({"project_id": project_id, **spec})
    if rows:
        table = sa.table(
            "smm_content_templates",
            sa.column("project_id", sa.Integer()), sa.column("code", sa.String()),
            sa.column("name", sa.String()), sa.column("description", sa.Text()),
            sa.column("prompt_template", sa.Text()), sa.column("input_schema_json", sa.JSON()),
            sa.column("output_format", sa.String()), sa.column("sort_order", sa.Integer()),
        )
        op.bulk_insert(table, rows)


def downgrade() -> None:
    codes = ", ".join("'" + spec["code"] + "'" for spec in NEW_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM smm_content_templates WHERE code IN ({codes})"))
