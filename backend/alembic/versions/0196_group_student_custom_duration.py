"""groups: group_students.custom_duration_minutes — индивидуальная длительность занятия ученика в группе

Revision ID: 0196
Revises: 0195
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0196"
down_revision = "0195"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "group_students",
        sa.Column("custom_duration_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("group_students", "custom_duration_minutes")
