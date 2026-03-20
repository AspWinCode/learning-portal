"""0080: lead_activities — unified activity log for timeline

Revision ID: 0080
Revises: 0079
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_activities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False, index=True),
        sa.Column("type", sa.String(64), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("status_effect_from", sa.String(64), nullable=True),
        sa.Column("status_effect_to", sa.String(64), nullable=True),
        sa.Column("related_task_id", sa.Integer(), sa.ForeignKey("lead_tasks.id"), nullable=True),
        sa.Column("related_invoice_id", sa.Integer(), sa.ForeignKey("invoices.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("lead_activities")
