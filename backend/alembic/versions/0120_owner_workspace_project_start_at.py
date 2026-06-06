"""owner workspace project start date

Revision ID: 0120_owner_workspace_project_start_at
Revises: 0119_owner_workspace_meetings
Create Date: 2026-06-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0120_owner_workspace_project_start_at"
down_revision = "0119_owner_workspace_meetings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("owner_workspace_projects", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("owner_workspace_projects", "start_at")
