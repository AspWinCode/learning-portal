"""B2B school interactions (journal)

Revision ID: 0030_b2b_interactions
Revises: 0029_b2b_extra
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0030_b2b_interactions"
down_revision = "0029_b2b_extra"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"), {"t": name}
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    if _table_exists(conn, "b2b_school_interactions"):
        return
    op.create_table(
        "b2b_school_interactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("b2b_school_id", sa.Integer(), sa.ForeignKey("b2b_schools.id"), nullable=False, index=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "b2b_school_interactions"):
        op.drop_table("b2b_school_interactions")
