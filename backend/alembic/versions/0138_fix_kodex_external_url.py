"""fix kodex external_url to point at the SSO endpoint, not bare domain

Revision ID: 0138_fix_kodex_external_url
Revises: 0137_seed_kodex_catalog_item
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0138_fix_kodex_external_url"
down_revision = "0137_seed_kodex_catalog_item"
branch_labels = None
depends_on = None

course_catalog_items = sa.table(
    "course_catalog_items",
    sa.column("code", sa.String),
    sa.column("external_url", sa.String),
)


def upgrade() -> None:
    op.execute(
        course_catalog_items.update()
        .where(course_catalog_items.c.code == "kodex")
        .values(external_url="https://kodex.tirskix.space/api/auth/sso")
    )


def downgrade() -> None:
    op.execute(
        course_catalog_items.update()
        .where(course_catalog_items.c.code == "kodex")
        .values(external_url="https://kodex.tirskix.space")
    )
