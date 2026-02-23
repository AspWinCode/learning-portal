"""Add training_start_date to students.

Revision ID: 0042_training_start
Revises: 0041_trainer_override
Create Date: 2026-02-23

"""
from alembic import op
import sqlalchemy as sa


revision = "0042_training_start"
down_revision = "0041_trainer_override"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("training_start_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("students", "training_start_date")
