"""Add capacity field to events

Revision ID: 0011_add_event_capacity
Revises: 0010_add_info_templates_and_communications
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_add_event_capacity"
down_revision = "0010_add_info_templates_and_communications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("capacity", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "capacity")
