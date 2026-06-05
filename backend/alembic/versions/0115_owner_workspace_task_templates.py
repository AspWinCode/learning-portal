"""Add owner_workspace_task_templates table

Revision ID: 0115_owner_workspace_task_templates
Revises: 0114_contact_counterparty_link
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0115_owner_workspace_task_templates"
down_revision = "0114_contact_counterparty_link"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "owner_workspace_task_templates",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(20), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("checklist", sa.JSON(), nullable=True),
        sa.Column("effort_hours", sa.Integer(), nullable=True),
        sa.Column("effort_minutes", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ow_task_templates_owner_id", "owner_workspace_task_templates", ["owner_id"])


def downgrade():
    op.drop_index("ix_ow_task_templates_owner_id", "owner_workspace_task_templates")
    op.drop_table("owner_workspace_task_templates")
