"""Add communication_channel to leads

Revision ID: 0014_add_communication_channel_to_leads
Revises: 0013_student_program_link_status
Create Date: 2026-02-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_add_communication_channel_to_leads"
down_revision = "0013_student_program_link_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("communication_channel", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "communication_channel")
