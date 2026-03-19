"""0081: таблица lead_activities — единый таймлайн событий по лиду

Revision ID: 0081
Revises: 0080
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_activities",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("lead_id", sa.Integer, sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(64), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("channel", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("payload_json", sa.JSON, nullable=True),
        sa.Column("status_effect_from", sa.String(64), nullable=True),
        sa.Column("status_effect_to", sa.String(64), nullable=True),
        sa.Column("related_task_id", sa.Integer, sa.ForeignKey("lead_tasks.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("related_invoice_id", sa.Integer, sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    # Составной индекс для быстрой выборки таймлайна
    op.create_index(
        "ix_lead_activities_lead_created",
        "lead_activities",
        ["lead_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_lead_activities_lead_created", table_name="lead_activities")
    op.drop_table("lead_activities")
