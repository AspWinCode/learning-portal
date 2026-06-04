"""Add legal/banking fields to owner_workspace_counterparties

Revision ID: 0113_counterparty_extra_fields
Revises: 0112_split_contacts_counterparties
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0113_counterparty_extra_fields"
down_revision = "0112_split_contacts_counterparties"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    sa.Column("counterparty_role", sa.String(64), nullable=True),   # клиент/лид/партнер/поставщик
    sa.Column("inn",               sa.String(20),  nullable=True),
    sa.Column("kpp",               sa.String(20),  nullable=True),   # юрлица
    sa.Column("ogrn",              sa.String(20),  nullable=True),   # ОГРН / ОГРНИП
    sa.Column("legal_address",     sa.Text(),       nullable=True),
    sa.Column("actual_address",    sa.Text(),       nullable=True),
    sa.Column("website",           sa.String(255), nullable=True),
    sa.Column("industry",          sa.String(255), nullable=True),
    sa.Column("bank_account",      sa.String(64),  nullable=True),
    sa.Column("bank_corr_account", sa.String(64),  nullable=True),
    sa.Column("bank_bik",          sa.String(20),  nullable=True),
    sa.Column("bank_name",         sa.String(255), nullable=True),
    sa.Column("bank_currency",     sa.String(10),  nullable=True),
]


def upgrade() -> None:
    for col in NEW_COLUMNS:
        op.add_column("owner_workspace_counterparties", col)


def downgrade() -> None:
    for col in reversed(NEW_COLUMNS):
        op.drop_column("owner_workspace_counterparties", col.name)
