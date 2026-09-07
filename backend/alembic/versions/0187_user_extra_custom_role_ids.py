"""0187: extra_custom_role_ids on users

Позволяет назначать пользователю несколько дополнительных кастомных ролей
помимо основной custom_role_id — их права суммируются.

Revision ID: 0187
Revises: 0186
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0187"
down_revision = "0186"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "extra_custom_role_ids",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "extra_custom_role_ids")
