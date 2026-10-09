"""Allow custom date ranges for trainer calculation periods.

Revision ID: 0225
Revises: 0224
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa


revision = "0225"
down_revision = "0224"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "trainer_period_bonuses",
        "period",
        existing_type=sa.String(length=7),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.alter_column(
        "trainer_payouts",
        "period",
        existing_type=sa.String(length=7),
        type_=sa.String(length=32),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "trainer_payouts",
        "period",
        existing_type=sa.String(length=32),
        type_=sa.String(length=7),
        existing_nullable=False,
    )
    op.alter_column(
        "trainer_period_bonuses",
        "period",
        existing_type=sa.String(length=32),
        type_=sa.String(length=7),
        existing_nullable=False,
    )
