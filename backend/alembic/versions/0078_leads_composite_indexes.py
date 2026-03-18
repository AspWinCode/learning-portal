"""Add composite indexes on leads for common filter combinations

Revision ID: 0078_leads_composite_indexes
Revises: 0077_leads_gin_trgm_indexes
Create Date: 2026-03-17

"""
from alembic import op


revision = "0078_leads_composite_indexes"
down_revision = "0077_leads_gin_trgm_indexes"
branch_labels = None
depends_on = None

_COMPOSITE_INDEXES = [
    # Самая частая комбинация: менеджер видит свои лиды, отсортированные по дате
    ("ix_leads_owner_id_created_at",        "leads", "(owner_id, created_at DESC)"),
    # Фильтр по статусу + сортировка по дате (общий список без фильтра по owner)
    ("ix_leads_status_created_at",          "leads", "(status, created_at DESC)"),
    # Комбо: роль-фильтр + статус + дата — покрывает большинство запросов менеджеров
    ("ix_leads_owner_id_status_created_at", "leads", "(owner_id, status, created_at DESC)"),
]


def upgrade() -> None:
    for index_name, table, columns in _COMPOSITE_INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} {columns}"
        )


def downgrade() -> None:
    for index_name, _table, _columns in _COMPOSITE_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
