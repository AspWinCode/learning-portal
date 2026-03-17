"""Add GIN trigram indexes on leads text search fields

Revision ID: 0077_leads_gin_trgm_indexes
Revises: 0076_leadstatus_new_values
Create Date: 2026-03-17

"""
from alembic import op


revision = "0077_leads_gin_trgm_indexes"
down_revision = "0076_leadstatus_new_values"
branch_labels = None
depends_on = None

# Поля, по которым идёт ILIKE-поиск в list_leads
_GIN_INDEXES = [
    ("ix_leads_contact_name_gin",    "leads", "contact_name"),
    ("ix_leads_phone_gin",           "leads", "phone"),
    ("ix_leads_parent_full_name_gin","leads", "parent_full_name"),
    ("ix_leads_child_full_name_gin", "leads", "child_full_name"),
    ("ix_leads_parent_phone_gin",    "leads", "parent_phone"),
    ("ix_leads_child_phone_gin",     "leads", "child_phone"),
    ("ix_leads_school_name_gin",     "leads", "school_name"),
    ("ix_leads_school_class_gin",    "leads", "school_class"),
]


def upgrade() -> None:
    # pg_trgm необходим для GIN-индексов по ILIKE-запросам
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    for index_name, table, column in _GIN_INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {index_name} "
            f"ON {table} USING GIN ({column} gin_trgm_ops)"
        )


def downgrade() -> None:
    for index_name, _table, _column in _GIN_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
