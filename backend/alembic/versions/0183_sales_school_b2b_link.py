"""Add sales_schools.b2b_school_id link and backfill by name

Revision ID: 0183
Revises: 0182
Create Date: 2026-09-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0183"
down_revision = "0182"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_schools",
        sa.Column("b2b_school_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_sales_schools_b2b_school_id", "sales_schools", ["b2b_school_id"]
    )
    op.create_foreign_key(
        "fk_sales_schools_b2b_school_id",
        "sales_schools",
        "b2b_schools",
        ["b2b_school_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill: link each sales school to its b2b twin when the name matches
    # exactly one b2b record (case-insensitive).
    op.execute(
        """
        UPDATE sales_schools s
        SET b2b_school_id = m.b2b_id
        FROM (
            SELECT s2.id AS sales_id, MIN(b.id) AS b2b_id
            FROM sales_schools s2
            JOIN b2b_schools b
              ON lower(btrim(b.name::text)) = lower(btrim(s2.name))
            GROUP BY s2.id
            HAVING COUNT(b.id) = 1
        ) m
        WHERE s.id = m.sales_id
          AND s.b2b_school_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_sales_schools_b2b_school_id", "sales_schools", type_="foreignkey"
    )
    op.drop_index("ix_sales_schools_b2b_school_id", table_name="sales_schools")
    op.drop_column("sales_schools", "b2b_school_id")
