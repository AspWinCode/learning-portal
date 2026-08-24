"""seed technolab course catalog item

Revision ID: 0178
Revises: 0177
Create Date: 2026-08-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0178"
down_revision = "0177"
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
            code="pro",
            name="ТехноЛаб",
            description="Задачи на автопроверку кода (Python, SQL, C++, JavaScript) с разбором и лекциями.",
            kind="external",
            external_url="https://pro.tirskix.space/api/auth/sso",
            is_active=True,
            sort_order=1,
        )
    )


def downgrade() -> None:
    op.execute(course_catalog_items.delete().where(course_catalog_items.c.code == "pro"))
