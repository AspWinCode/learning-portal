"""B2B school: friendship_degree, stage fields, contacts table; add new pipeline stage

Revision ID: 0019_b2b_school_fields_and_contacts
Revises: 0018_add_b2b_schools
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0019_b2b_school_fields_and_contacts"
down_revision = "0018_add_b2b_schools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("b2b_schools", sa.Column("friendship_degree", sa.String(32), nullable=True))
    op.add_column("b2b_schools", sa.Column("meeting_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("b2b_schools", sa.Column("meeting_outcomes", sa.Text(), nullable=True))
    op.add_column("b2b_schools", sa.Column("walkthrough_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_b2b_schools_friendship_degree", "b2b_schools", ["friendship_degree"], unique=False)

    op.create_table(
        "b2b_school_contacts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("b2b_school_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("position", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("phone_extra", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["b2b_school_id"], ["b2b_schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_b2b_school_contacts_b2b_school_id", "b2b_school_contacts", ["b2b_school_id"], unique=False)

    op.drop_column("b2b_schools", "contacts")
    op.alter_column(
        "b2b_schools",
        "pipeline_stage",
        server_default=sa.text("'new'"),
    )


def downgrade() -> None:
    op.alter_column("b2b_schools", "pipeline_stage", server_default=sa.text("'contact_found'"))
    op.add_column("b2b_schools", sa.Column("contacts", sa.Text(), nullable=True))
    op.drop_index("ix_b2b_school_contacts_b2b_school_id", table_name="b2b_school_contacts")
    op.drop_table("b2b_school_contacts")
    op.drop_index("ix_b2b_schools_friendship_degree", table_name="b2b_schools")
    op.drop_column("b2b_schools", "walkthrough_scheduled_at")
    op.drop_column("b2b_schools", "meeting_outcomes")
    op.drop_column("b2b_schools", "meeting_scheduled_at")
    op.drop_column("b2b_schools", "friendship_degree")
