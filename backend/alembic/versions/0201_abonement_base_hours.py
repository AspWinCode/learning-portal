"""Add abonements.base_hours — per-abonement configurable hours quota.

Revision ID: 0201
Revises: 0200
Create Date: 2026-09-25

Group-lesson billing (trainer_lessons.py) divides the abonement price by a
fixed hours quota to get a price-per-hour rate, then multiplies by lesson
duration. That quota was hardcoded to 8 hours for every abonement, which is
wrong for abonements whose real quota is different (e.g. 16 hours) — this
was discovered as a real billing overcharge (2x) on some group abonements.
No data backfill here: NULL keeps the current fallback of 8 hours for every
existing abonement, so nothing changes until an owner/admin explicitly sets
the real value per abonement via the UI.
"""
from alembic import op
import sqlalchemy as sa


revision = "0201"
down_revision = "0200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("abonements", sa.Column("base_hours", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("abonements", "base_hours")
