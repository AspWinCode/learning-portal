"""Add direction (направление) to groups

Revision ID: 0026_group_direction
Revises: 0025_parent_invite_token
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0026_group_direction"
down_revision = "0025_parent_invite_token"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "groups", "direction"):
        op.add_column("groups", sa.Column("direction", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "groups", "direction"):
        op.drop_column("groups", "direction")
