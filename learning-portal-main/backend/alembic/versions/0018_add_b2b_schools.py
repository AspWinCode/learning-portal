"""Add B2B schools table and lead link

Revision ID: 0018_add_b2b_schools
Revises: 0017_add_lead_questionnaire_filled
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0018_add_b2b_schools"
down_revision = "0017_add_lead_questionnaire_filled"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "b2b_schools",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("director", sa.String(), nullable=True),
        sa.Column("contacts", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("student_count", sa.Integer(), nullable=True),
        sa.Column("pipeline_stage", sa.String(32), nullable=False, server_default="contact_found"),
        sa.Column("event_dates", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_b2b_schools_name", "b2b_schools", ["name"], unique=False)
    op.create_index("ix_b2b_schools_pipeline_stage", "b2b_schools", ["pipeline_stage"], unique=False)

    op.add_column(
        "leads",
        sa.Column("b2b_school_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_leads_b2b_school_id",
        "leads",
        "b2b_schools",
        ["b2b_school_id"],
        ["id"],
    )
    op.create_index("ix_leads_b2b_school_id", "leads", ["b2b_school_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leads_b2b_school_id", table_name="leads")
    op.drop_constraint("fk_leads_b2b_school_id", "leads", type_="foreignkey")
    op.drop_column("leads", "b2b_school_id")
    op.drop_index("ix_b2b_schools_pipeline_stage", table_name="b2b_schools")
    op.drop_index("ix_b2b_schools_name", table_name="b2b_schools")
    op.drop_table("b2b_schools")
