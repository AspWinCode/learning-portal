"""Add invite token for parent invitation (set password by link)

Revision ID: 0025_parent_invite_token
Revises: 0024_student_card_student_id
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0025_parent_invite_token"
down_revision = "0024_student_card_student_id"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "users", "invite_token_hash"):
        op.add_column("users", sa.Column("invite_token_hash", sa.String(), nullable=True))
    if not _column_exists(conn, "users", "invite_token_expires_at"):
        op.add_column("users", sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "users", "invite_token_expires_at"):
        op.drop_column("users", "invite_token_expires_at")
    if _column_exists(conn, "users", "invite_token_hash"):
        op.drop_column("users", "invite_token_hash")
