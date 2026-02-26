"""Add trainer_rate_per_hour, trainer_period_bonuses, trainer_payouts.

Revision ID: 0049_trainer_calculations
Revises: 0048_group_start_and_format
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0049_trainer_calculations"
down_revision = "0048_group_start_and_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trainer_rate_per_hour", sa.Float(), nullable=True))

    op.create_table(
        "trainer_period_bonuses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("period", sa.String(7), nullable=False, index=True),
        sa.Column("bonus", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("trainer_id", "period", name="uq_trainer_period_bonus"),
    )

    op.create_table(
        "trainer_payouts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("period", sa.String(7), nullable=False, index=True),
        sa.Column("lessons_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hours_count", sa.Float(), nullable=False, server_default="0"),
        sa.Column("rate_per_lesson", sa.Float(), nullable=True),
        sa.Column("rate_per_hour", sa.Float(), nullable=True),
        sa.Column("base_payment", sa.Float(), nullable=False, server_default="0"),
        sa.Column("bonus", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("paid_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("trainer_id", "period", name="uq_trainer_payout_period"),
    )


def downgrade() -> None:
    op.drop_table("trainer_payouts")
    op.drop_table("trainer_period_bonuses")
    op.drop_column("users", "trainer_rate_per_hour")
