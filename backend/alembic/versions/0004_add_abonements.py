"""Add abonements table and student abonement reference

Revision ID: 0004_add_abonements
Revises: 0003_add_owner_role
Create Date: 2026-01-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_add_abonements"
down_revision = "0003_add_owner_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum types for PostgreSQL
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'abonementstatus') THEN
                CREATE TYPE abonementstatus AS ENUM ('active', 'archived');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discounttype') THEN
                CREATE TYPE discounttype AS ENUM ('none', 'amount', 'percent');
            END IF;
        END $$;
        """
    )

    op.create_table(
        "abonements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("discount_type", sa.Enum(name="discounttype"), nullable=False, server_default="none"),
        sa.Column("discount_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.Enum(name="abonementstatus"), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column("students", sa.Column("abonement_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_students_abonement_id",
        "students",
        "abonements",
        ["abonement_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_students_abonement_id", "students", type_="foreignkey")
    op.drop_column("students", "abonement_id")
    op.drop_table("abonements")
    op.execute("DROP TYPE IF EXISTS abonementstatus")
    op.execute("DROP TYPE IF EXISTS discounttype")

