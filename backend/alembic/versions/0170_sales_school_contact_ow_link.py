"""Link sales_school_contacts to owner_workspace_contacts

Revision ID: 0170
Revises: 0169
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0170"
down_revision = "0169"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_school_contacts",
        sa.Column(
            "owner_workspace_contact_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_contacts.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("sales_school_contacts", "owner_workspace_contact_id")
