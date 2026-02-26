"""Add account_templates (шаблоны счетов: название + формат).

Revision ID: 0053_account_templates
Revises: 0052_abonement_format
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0053_account_templates"
down_revision = "0052_abonement_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("format", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_templates_name"), "account_templates", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_account_templates_name"), table_name="account_templates")
    op.drop_table("account_templates")
