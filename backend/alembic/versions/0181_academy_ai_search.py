"""academy_ai semantic search: tsvector FTS columns (always) + pgvector embedding
columns (when the vector extension is available)

Revision ID: 0181
Revises: 0180
Create Date: 2026-09-01
"""
import sqlalchemy as sa
from alembic import op

revision = "0181"
down_revision = "0180"
branch_labels = None
depends_on = None

_CHUNK_TABLES = ("academy_kb_chunks", "academy_expertise_chunks")


def _add_fts(table: str) -> None:
    # STORED generated column: явный regconfig 'russian' => выражение immutable.
    op.execute(
        sa.text(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS search_tsv tsvector "
            f"GENERATED ALWAYS AS (to_tsvector('russian', coalesce(text, ''))) STORED"
        )
    )
    op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table}_search_tsv ON {table} USING GIN (search_tsv)"))


def _try_add_pgvector(table: str) -> None:
    # Колонка без фикс. размерности: ANN-индекс не строим (объём чанков БЗ
    # небольшой, точный поиск по <=> достаточно быстрый). Индекс можно добавить
    # отдельной миграцией, когда размерность модели эмбеддингов зафиксируется.
    op.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS embedding vector"))


def _extension_available(bind, name: str) -> bool:
    """Есть ли расширение среди устанавливаемых (не бросает ошибку и не портит
    транзакцию, в отличие от неудачного CREATE EXTENSION)."""
    return bind.execute(
        sa.text("SELECT 1 FROM pg_available_extensions WHERE name = :n"), {"n": name}
    ).first() is not None


def upgrade() -> None:
    bind = op.get_bind()

    for table in _CHUNK_TABLES:
        _add_fts(table)

    # pg_trgm — для ILIKE-фолбэка (не критично, если недоступно)
    if _extension_available(bind, "pg_trgm"):
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    # pgvector — опционально: если образ БД без расширения, продолжаем на FTS.
    # Проверяем доступность ДО CREATE EXTENSION, чтобы не оборвать транзакцию
    # миграции на образе postgres:16-alpine (там vector нет).
    if _extension_available(bind, "vector"):
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
        for table in _CHUNK_TABLES:
            _try_add_pgvector(table)


def downgrade() -> None:
    for table in _CHUNK_TABLES:
        op.execute(sa.text(f"DROP INDEX IF EXISTS ix_{table}_search_tsv"))
        op.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS embedding"))
        op.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS search_tsv"))
