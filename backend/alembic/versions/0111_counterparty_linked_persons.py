"""Add linked_persons JSON to owner_workspace_contacts

Revision ID: 0111_counterparty_linked_persons
Revises: 0110_counterparties_projects_redesign
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0111_counterparty_linked_persons"
down_revision = "0110_counterparties_projects_redesign"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "owner_workspace_contacts",
        sa.Column("linked_persons", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("owner_workspace_contacts", "linked_persons")
