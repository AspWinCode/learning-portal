"""Add site_settings table

Revision ID: 0147_site_settings
Revises: 0146_seo_redirects
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0147_site_settings"
down_revision = "0146_seo_redirects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("site_title", sa.String(255), nullable=True),
        sa.Column("site_description", sa.Text, nullable=True),
        sa.Column("contact_phone", sa.String(100), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("vk_url", sa.String(500), nullable=True),
        sa.Column("tg_url", sa.String(500), nullable=True),
        sa.Column("inst_url", sa.String(500), nullable=True),
        sa.Column("ga_measurement_id", sa.String(50), nullable=True),
        sa.Column("ym_counter_id", sa.String(20), nullable=True),
        sa.Column("vk_pixel_id", sa.String(100), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("site_settings")
