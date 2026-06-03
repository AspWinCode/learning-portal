"""App settings (site logo)

Revision ID: 0002_app_settings_logo
Revises: 0001_telegram_pwd_reset
Create Date: 2026-01-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_app_settings_logo"
down_revision = "0001_telegram_pwd_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("key", name="uq_app_settings_key"),
    )
    op.create_index("ix_app_settings_key", "app_settings", ["key"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_app_settings_key", table_name="app_settings")
    op.drop_table("app_settings")


