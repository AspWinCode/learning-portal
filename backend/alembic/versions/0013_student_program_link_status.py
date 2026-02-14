"""Add status to student_programs (active/archived) for soft unassign

Revision ID: 0013_student_program_link_status
Revises: 0012_add_school_analytics_fields_to_leads
Create Date: 2026-01-29

"""
from alembic import op
import sqlalchemy as sa


revision = "0013_student_program_link_status"
down_revision = "0012_add_school_analytics_fields_to_leads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    link_status = sa.Enum("active", "archived", name="studentprogramlinkstatus")
    link_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "student_programs",
        sa.Column("status", link_status, nullable=False, server_default="active"),
    )


def downgrade() -> None:
    op.drop_column("student_programs", "status")
    link_status = sa.Enum("active", "archived", name="studentprogramlinkstatus")
    link_status.drop(op.get_bind(), checkfirst=True)
