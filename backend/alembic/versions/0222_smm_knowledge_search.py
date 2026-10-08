"""smm_knowledge_items semantic search: FTS column (always) + pgvector
embedding column (when available) — same pattern as 0216_ai_studio_phase3.

Revision ID: 0222
Revises: 0221
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0222"
down_revision = "0221"
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
            "ALTER TABLE smm_knowledge_items ADD COLUMN IF NOT EXISTS search_tsv tsvector "
            "GENERATED ALWAYS AS (to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED"
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_smm_knowledge_items_search_tsv ON smm_knowledge_items USING GIN (search_tsv)"))

    if _extension_available(bind, "vector"):
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
        bind.execute(sa.text("ALTER TABLE smm_knowledge_items ADD COLUMN IF NOT EXISTS embedding vector"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_smm_knowledge_items_search_tsv"))
    op.execute(sa.text("ALTER TABLE smm_knowledge_items DROP COLUMN IF EXISTS embedding"))
    op.execute(sa.text("ALTER TABLE smm_knowledge_items DROP COLUMN IF EXISTS search_tsv"))
