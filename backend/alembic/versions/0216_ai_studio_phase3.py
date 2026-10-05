"""AI Studio Phase 3: knowledge semantic search (FTS always, pgvector when
available — same pattern as 0181_academy_ai_search), generated assets
(image generation), publish log (manual, human-triggered publishing audit).

Revision ID: 0216
Revises: 0215
Create Date: 2026-10-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0216"
down_revision = "0215"
branch_labels = None
depends_on = None


def _extension_available(bind, name: str) -> bool:
    return bind.execute(
        sa.text("SELECT 1 FROM pg_available_extensions WHERE name = :n"), {"n": name}
    ).first() is not None


def upgrade() -> None:
    bind = op.get_bind()

    op.execute(
        sa.text(
            "ALTER TABLE ai_knowledge_items ADD COLUMN IF NOT EXISTS search_tsv tsvector "
            "GENERATED ALWAYS AS (to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED"
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ai_knowledge_items_search_tsv ON ai_knowledge_items USING GIN (search_tsv)"))

    if _extension_available(bind, "vector"):
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
        bind.execute(sa.text("ALTER TABLE ai_knowledge_items ADD COLUMN IF NOT EXISTS embedding vector"))

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
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
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


def downgrade() -> None:
    op.drop_table("ai_publish_logs")
    op.drop_table("ai_generated_assets")
    op.execute(sa.text("DROP INDEX IF EXISTS ix_ai_knowledge_items_search_tsv"))
    op.execute(sa.text("ALTER TABLE ai_knowledge_items DROP COLUMN IF EXISTS embedding"))
    op.execute(sa.text("ALTER TABLE ai_knowledge_items DROP COLUMN IF EXISTS search_tsv"))
