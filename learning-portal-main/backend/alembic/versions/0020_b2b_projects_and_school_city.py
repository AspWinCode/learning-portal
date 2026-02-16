"""Add B2B projects and city for B2B schools

Revision ID: 0020_b2b_projects_and_school_city
Revises: 0019_b2b_school_fields_and_contacts
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0020_b2b_projects_and_school_city"
down_revision = "0019_b2b_school_fields_and_contacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # City for B2B schools
    op.add_column("b2b_schools", sa.Column("city", sa.String(), nullable=True))
    op.create_index("ix_b2b_schools_city", "b2b_schools", ["city"], unique=False)

    # B2B projects table
    op.create_table(
        "b2b_projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("main_city", sa.String(), nullable=True),
        sa.Column("cities", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_b2b_projects_name", "b2b_projects", ["name"], unique=False)
    op.create_index("ix_b2b_projects_main_city", "b2b_projects", ["main_city"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_b2b_projects_main_city", table_name="b2b_projects")
    op.drop_index("ix_b2b_projects_name", table_name="b2b_projects")
    op.drop_table("b2b_projects")
    op.drop_index("ix_b2b_schools_city", table_name="b2b_schools")
    op.drop_column("b2b_schools", "city")

