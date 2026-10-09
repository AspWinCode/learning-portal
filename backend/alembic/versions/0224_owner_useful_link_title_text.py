"""Allow long titles for owner useful links.

Revision ID: 0224
Revises: 0223
Create Date: 2026-10-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0224"
down_revision = "0223"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "owner_useful_links",
        "title",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "owner_useful_links",
        "title",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
