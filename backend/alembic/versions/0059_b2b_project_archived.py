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


def _table_exists(conn, name: str) -> bool:
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"),
        {"t": name},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_projects"):
        # b2b_projects was never created by a migration — create it now.
        op.create_table(
            "b2b_projects",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("location", sa.String(), nullable=True),
            sa.Column("main_city", sa.String(), nullable=True),
            sa.Column("cities", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_b2b_projects_id", "b2b_projects", ["id"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_projects_name", "b2b_projects", ["name"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_projects_main_city", "b2b_projects", ["main_city"], unique=False, if_not_exists=True)
    op.add_column(
        "b2b_projects",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_b2b_projects_archived", "b2b_projects", ["archived"], unique=False, if_not_exists=True)


def downgrade() -> None:
  op.drop_index("ix_b2b_projects_archived", table_name="b2b_projects")
  op.drop_column("b2b_projects", "archived")

