"""academy_ai: business profile (постоянный контекст бизнеса для консультанта)

Revision ID: 0191
Revises: 0190
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0191"
down_revision = "0190"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academy_business_profile",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("mission", sa.Text(), nullable=True),
        sa.Column("target_audience", sa.Text(), nullable=True),
        sa.Column("usp", sa.Text(), nullable=True),
        sa.Column("pricing_policy", sa.Text(), nullable=True),
        sa.Column("tone_of_voice", sa.Text(), nullable=True),
        sa.Column("competitors", sa.Text(), nullable=True),
        sa.Column("key_facts", sa.Text(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("academy_business_profile")
