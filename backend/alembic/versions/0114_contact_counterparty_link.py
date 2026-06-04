"""Add counterparty_id FK to owner_workspace_contacts

Revision ID: 0114_contact_counterparty_link
Revises: 0113_counterparty_extra_fields
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0114_contact_counterparty_link"
down_revision = "0113_counterparty_extra_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("counterparty_id", sa.Integer(), nullable=True, index=True),
    )
    op.create_foreign_key(
        "owner_workspace_contacts_counterparty_id_fkey",
        "owner_workspace_contacts", "owner_workspace_counterparties",
        ["counterparty_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "owner_workspace_contacts_counterparty_id_fkey",
        "owner_workspace_contacts",
        type_="foreignkey",
    )
    op.drop_column("owner_workspace_contacts", "counterparty_id")
