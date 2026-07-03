"""seed kodex course catalog item

Revision ID: 0137_seed_kodex_catalog_item
Revises: 0136_student_portal_foundation
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0137_seed_kodex_catalog_item"
down_revision = "0136_student_portal_foundation"
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
            code="kodex",
            name="Кодэкс",
            description="Детективная вселенная, в которой школьник учится Python, раскрывая дела агентства «Кодэкс».",
            kind="external",
            external_url="https://kodex.tirskix.space",
            is_active=True,
            sort_order=0,
        )
    )


def downgrade() -> None:
    op.execute(course_catalog_items.delete().where(course_catalog_items.c.code == "kodex"))
