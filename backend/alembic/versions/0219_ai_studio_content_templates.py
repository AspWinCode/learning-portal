"""Seed shared social scenarios for Academy and KodArena workspaces."""
from alembic import op
import sqlalchemy as sa

revision = "0219"
down_revision = "0218"
branch_labels = None
depends_on = None


COMMON = {
    "social_post": ("Пост для соцсетей", ["topic", "goal", "audience", "facts", "cta", "tone", "length"]),
    "event_announcement": ("Анонс события", ["event_name", "date", "time", "place", "audience", "age", "price", "registration_link", "important_facts"]),
    "event_recap": ("Итоги события", ["event_name", "date", "participants_count", "results", "winners", "highlights", "partners", "link"]),
    "educational_post": ("Образовательный пост", ["topic", "target_audience", "key_points", "cta"]),
    "success_story": ("История успеха", ["participant_student", "achievement", "story", "allowed_facts", "cta"]),
    "reminder": ("Напоминание", ["event", "date", "time", "registration_link", "urgency"]),
}

SPECIFIC = {
    "academy_program_recruitment": ("Набор на программу", ["program", "audience", "dates", "benefits", "facts", "cta"]),
    "academy_exam_prep": ("Подготовка к ОГЭ/ЕГЭ", ["exam", "subject", "audience", "program_facts", "cta"]),
    "academy_parent_post": ("Пост для родителей", ["topic", "facts", "parent_questions", "cta"]),
    "kodarena_tournament_announcement": ("Анонс турнира КодАрены", ["tournament", "date", "format", "age", "rules", "registration_link", "cta"]),
    "kodarena_tournament_results": ("Итоги турнира КодАрены", ["tournament", "results", "winners", "highlights", "partners", "cta"]),
    "kodarena_school_invitation": ("Приглашение школ", ["offer", "audience", "facts", "contacts", "cta"]),
}


def _fields(keys):
    return {"fields": [{"key": key, "label": key.replace("_", " ").capitalize(), "type": "text", "required": key in keys[:1]} for key in keys]}


def upgrade() -> None:
    bind = op.get_bind()
    workspaces = {row.code: row.id for row in bind.execute(sa.text("SELECT id, code FROM ai_workspaces WHERE code IN ('academy', 'kodarena')"))}
    existing = {(row.workspace_id, row.code) for row in bind.execute(sa.text("SELECT workspace_id, code FROM ai_content_templates"))}
    templates = []
    for code, workspace_id in workspaces.items():
        scenarios = {**COMMON, **({k: v for k, v in SPECIFIC.items() if k.startswith("academy_")} if code == "academy" else {k: v for k, v in SPECIFIC.items() if k.startswith("kodarena_")})}
        for order, (template_code, (name, keys)) in enumerate(scenarios.items(), start=1):
            if (workspace_id, template_code) in existing:
                continue
            templates.append({
                "workspace_id": workspace_id,
                "code": template_code,
                "name": name,
                "description": f"Сценарий контент-пайплайна для направления {code}.",
                "prompt_template": "Подготовь structured social post по полям: " + ", ".join(f"{key}: {{{key}}}" for key in keys) + ". Верни JSON с hook, body, cta, hashtags, image_prompt.",
                "input_schema_json": _fields(keys),
                "output_format": "json",
                "sort_order": order * 10,
            })
    if templates:
        table = sa.table(
            "ai_content_templates",
            sa.column("workspace_id", sa.Integer()), sa.column("code", sa.String()),
            sa.column("name", sa.String()), sa.column("description", sa.Text()),
            sa.column("prompt_template", sa.Text()), sa.column("input_schema_json", sa.JSON()),
            sa.column("output_format", sa.String()), sa.column("sort_order", sa.Integer()),
        )
        op.bulk_insert(table, templates)


def downgrade() -> None:
    codes = ", ".join("'" + code + "'" for code in [*COMMON, *SPECIFIC])
    op.execute(sa.text(f"DELETE FROM ai_content_templates WHERE code IN ({codes})"))
