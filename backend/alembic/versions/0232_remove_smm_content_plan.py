"""Убрать контент-план/автопилот SMM-проектов — заменён на прямую публикацию
(вставил текст → выбрал каналы/проект → «Запустить в работу», опционально
с отложенной датой). Периодичность/автопост больше не нужны.

Revision ID: 0232
Revises: 0231
Create Date: 2026-10-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0232"
down_revision = "0231"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("smm_content", "plan_item_id")
    op.drop_table("smm_content_plan_items")
    op.drop_table("smm_content_plans")


def downgrade() -> None:
    op.create_table(
        "smm_content_plans",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("smm_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("periodicity", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "smm_content_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("smm_content_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("channel", sa.String(32), nullable=True),
        sa.Column("content_type", sa.String(64), nullable=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("generated_content_id", sa.Integer(), sa.ForeignKey("smm_content.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column(
        "smm_content",
        sa.Column("plan_item_id", sa.Integer(), sa.ForeignKey("smm_content_plan_items.id", ondelete="SET NULL"), nullable=True, index=True),
    )
