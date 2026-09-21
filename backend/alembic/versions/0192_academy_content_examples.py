"""academy_ai: content examples bank (few-shot для генератора контента)

Revision ID: 0192
Revises: 0191
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0192"
down_revision = "0191"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academy_content_examples",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="post", index=True),
        sa.Column("direction", sa.String(32), nullable=True, index=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true(), index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("academy_content_examples")
