"""academy_ai proactivity: academy_insights table

Revision ID: 0182
Revises: 0181
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0182"
down_revision = "0181"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academy_insights",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("kind", sa.String(48), nullable=False, index=True),
        sa.Column("dedup_key", sa.String(128), nullable=False, index=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="open", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("academy_insights")
