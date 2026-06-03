"""B2B schools: next_step, next_step_date, manager_id (conveyor)

Revision ID: 0028_b2b_schools_conveyor
Revises: 0027_projects
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa


revision = "0028_b2b_schools_conveyor"
down_revision = "0027_projects"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"), {"t": name}
    ).scalar() is not None


def _column_exists(conn, table, column):
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    # Add conveyor fields for owner workflow (idempotent)
    if not _column_exists(conn, "b2b_schools", "next_step"):
        op.add_column("b2b_schools", sa.Column("next_step", sa.Text(), nullable=True))
    if not _column_exists(conn, "b2b_schools", "next_step_date"):
        op.add_column("b2b_schools", sa.Column("next_step_date", sa.Date(), nullable=True))
        op.create_index("ix_b2b_schools_next_step_date", "b2b_schools", ["next_step_date"], if_not_exists=True)
    if not _column_exists(conn, "b2b_schools", "manager_id"):
        op.add_column("b2b_schools", sa.Column("manager_id", sa.Integer(), nullable=True))
        op.create_index("ix_b2b_schools_manager_id", "b2b_schools", ["manager_id"], if_not_exists=True)
        op.create_foreign_key(
            "fk_b2b_schools_manager_id_users",
            "b2b_schools",
            "users",
            ["manager_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "b2b_schools"):
        return
    op.drop_constraint("fk_b2b_schools_manager_id_users", "b2b_schools", type_="foreignkey")
    op.drop_index("ix_b2b_schools_manager_id", table_name="b2b_schools")
    op.drop_index("ix_b2b_schools_next_step_date", table_name="b2b_schools")
    op.drop_column("b2b_schools", "manager_id")
    op.drop_column("b2b_schools", "next_step_date")
    op.drop_column("b2b_schools", "next_step")
