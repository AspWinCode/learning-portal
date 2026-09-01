"""academy_ai module: knowledge base, audit, expertise library, dialogs, content drafts, AI gateway log

Revision ID: 0180
Revises: 0179
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0180"
down_revision = "0179"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academy_kb_entries",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="fact", index=True),
        sa.Column("section", sa.String(64), nullable=True, index=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("ai_description", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("source_url", sa.String(1024), nullable=True),
        sa.Column("direction", sa.String(32), nullable=True, index=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("superseded_by_id", sa.Integer(), sa.ForeignKey("academy_kb_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "academy_kb_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("academy_kb_entries.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("ord", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "academy_audit_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="in_progress", index=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="initial"),
        sa.Column("started_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "academy_audit_questions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("section", sa.String(64), nullable=False, index=True),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("hint", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "academy_audit_answers",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("academy_audit_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("academy_audit_questions.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("section", sa.String(64), nullable=True, index=True),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("structured", sa.JSON(), nullable=True),
        sa.Column("kb_entry_id", sa.Integer(), sa.ForeignKey("academy_kb_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "academy_expertise_sources",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("type", sa.String(32), nullable=False, server_default="book"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active", index=True),
        sa.Column("origin_url", sa.String(1024), nullable=True),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("ai_description", sa.Text(), nullable=True),
        sa.Column("added_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "academy_expertise_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("academy_expertise_sources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("ord", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "academy_dialogs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="consult"),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "academy_messages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("dialog_id", sa.Integer(), sa.ForeignKey("academy_dialogs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("used_sources", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "academy_schedule_rules",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("cadence", sa.String(64), nullable=False, server_default="0 9 * * 1,3,5"),
        sa.Column("topics", sa.JSON(), nullable=True),
        sa.Column("proportions", sa.JSON(), nullable=True),
        sa.Column("tone", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "academy_content_drafts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="post"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft", index=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("image_prompt", sa.Text(), nullable=True),
        sa.Column("image_storage_key", sa.String(512), nullable=True),
        sa.Column("based_on", sa.JSON(), nullable=True),
        sa.Column("direction", sa.String(32), nullable=True, index=True),
        sa.Column("feedback_note", sa.Text(), nullable=True),
        sa.Column("schedule_rule_id", sa.Integer(), sa.ForeignKey("academy_schedule_rules.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "ai_gateway_call_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("feature", sa.String(64), nullable=False, index=True),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("purpose", sa.String(32), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="ok"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )

    _seed_audit_questions()


AUDIT_QUESTIONS = [
    ("niche", "Опишите вашу нишу и основные продукты (направления обучения).", "Программирование, подготовка к ОГЭ/ЕГЭ и т.д.", 10),
    ("niche", "В чём ваше уникальное ценностное предложение (УЦП)?", None, 20),
    ("finance", "Какие цены на основные курсы и из чего складывается стоимость?", None, 30),
    ("finance", "Какая рентабельность по каждому направлению за последний отчётный период?", None, 40),
    ("finance", "Как ведётся финансовая отчётность и как часто вы её смотрите?", None, 50),
    ("marketing", "Какие каналы привлечения используете и какой из них основной?", "Сайт, соцсети, сарафан, партнёрские школы", 60),
    ("marketing", "Есть ли сайт и активные соцсети? Дайте ссылки.", None, 70),
    ("sales", "Опишите вашу воронку продаж по этапам.", None, 80),
    ("sales", "Какие конверсии между этапами воронки?", None, 90),
    ("clients", "Как собираете отзывы и какой у вас уровень удержания/оттока?", None, 100),
    ("team", "Какие роли есть в команде, как устроена оплата и KPI?", None, 110),
    ("team", "Что уже делегировано, а что по-прежнему замкнуто на владельце?", None, 120),
]


def _seed_audit_questions() -> None:
    table = sa.table(
        "academy_audit_questions",
        sa.column("section", sa.String),
        sa.column("prompt", sa.Text),
        sa.column("hint", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        table,
        [
            {"section": s, "prompt": p, "hint": h, "sort_order": o, "is_active": True}
            for (s, p, h, o) in AUDIT_QUESTIONS
        ],
    )


def downgrade() -> None:
    op.drop_table("ai_gateway_call_logs")
    op.drop_table("academy_content_drafts")
    op.drop_table("academy_schedule_rules")
    op.drop_table("academy_messages")
    op.drop_table("academy_dialogs")
    op.drop_table("academy_expertise_chunks")
    op.drop_table("academy_expertise_sources")
    op.drop_table("academy_audit_answers")
    op.drop_table("academy_audit_questions")
    op.drop_table("academy_audit_sessions")
    op.drop_table("academy_kb_chunks")
    op.drop_table("academy_kb_entries")
