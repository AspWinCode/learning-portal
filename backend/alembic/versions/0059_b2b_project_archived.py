"""Add archived flag to B2B projects

Revision ID: 0059_b2b_project_archived
Revises: 0058_task_category
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa


revision = "0059_b2b_project_archived"
down_revision = "0058_task_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
      "b2b_projects",
      sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index("ix_b2b_projects_archived", "b2b_projects", ["archived"], unique=False, if_not_exists=True)


def downgrade() -> None:
  op.drop_index("ix_b2b_projects_archived", table_name="b2b_projects")
  op.drop_column("b2b_projects", "archived")

