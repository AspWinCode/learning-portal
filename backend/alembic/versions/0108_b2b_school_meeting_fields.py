"""B2B school: add missing meeting and event_dates fields

Revision ID: 0108_b2b_school_meeting_fields
Revises: 0107_disk_storage
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0108_b2b_school_meeting_fields"
down_revision = "0107_disk_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("b2b_schools", sa.Column("event_dates", sa.JSON(), nullable=True))
    op.add_column("b2b_schools", sa.Column("meeting_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("b2b_schools", sa.Column("meeting_outcomes", sa.Text(), nullable=True))
    op.add_column("b2b_schools", sa.Column("walkthrough_scheduled_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("b2b_schools", "walkthrough_scheduled_at")
    op.drop_column("b2b_schools", "meeting_outcomes")
    op.drop_column("b2b_schools", "meeting_scheduled_at")
    op.drop_column("b2b_schools", "event_dates")
