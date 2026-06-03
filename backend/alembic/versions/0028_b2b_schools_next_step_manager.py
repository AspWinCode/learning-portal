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
        # Table was missing from the initial schema — create it now.
        # Columns added by later migrations (0029, 0033, 0060, 0061, 0101, 0102)
        # are NOT included here; those migrations will ADD them.
        op.create_table(
            "b2b_schools",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("director", sa.String(), nullable=True),
            sa.Column("city", sa.String(), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("student_count", sa.Integer(), nullable=True),
            sa.Column("friendship_degree", sa.String(32), nullable=True),
            sa.Column(
                "pipeline_stage",
                sa.String(32),
                nullable=False,
                server_default="new",
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_b2b_schools_name", "b2b_schools", ["name"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_schools_pipeline_stage", "b2b_schools", ["pipeline_stage"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_schools_friendship_degree", "b2b_schools", ["friendship_degree"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_schools_city", "b2b_schools", ["city"], unique=False, if_not_exists=True)
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
