"""Add trainer compensation fields

Revision ID: 0006_add_trainer_comp_fields
Revises: 0005_add_abonement_price
Create Date: 2026-01-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_add_trainer_comp_fields"
down_revision = "0005_add_abonement_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trainer_rate", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("trainer_lessons", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trainer_lessons")
    op.drop_column("users", "trainer_rate")

