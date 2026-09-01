"""seed pixelforge course catalog item

Revision ID: 0179
Revises: 0178
Create Date: 2026-09-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0179"
down_revision = "0178"
branch_labels = None
depends_on = None

course_catalog_items = sa.table(
    "course_catalog_items",
    sa.column("code", sa.String),
    sa.column("name", sa.String),
    sa.column("description", sa.Text),
    sa.column("kind", sa.String),
    sa.column("external_url", sa.String),
    sa.column("is_active", sa.Boolean),
    sa.column("sort_order", sa.Integer),
)


def upgrade() -> None:
    op.execute(
        course_catalog_items.insert().values(
            code="pixelforge",
            name="PixelForge",
            description="Платформа обучения разработке игр: интерактивные курсы, встроенный редактор кода, сдача проектов и геймификация.",
            kind="external",
            external_url="https://pixelforge.tirskix.space/api/auth/sso",
            is_active=True,
            sort_order=2,
        )
    )


def downgrade() -> None:
    op.execute(course_catalog_items.delete().where(course_catalog_items.c.code == "pixelforge"))
