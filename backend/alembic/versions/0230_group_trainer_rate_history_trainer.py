"""Add trainer_id to group_trainer_rate_history for per-substitute rates.

Revision ID: 0230
Revises: 0229
Create Date: 2026-10-12

Разные тренеры, ведущие одну и ту же группу (основной и подменяющие),
могут получать разную оплату. trainer_id=NULL в истории — ставка
группы по умолчанию (основной тренер, как было раньше); конкретный
trainer_id — персональное переопределение ставки для этого тренера
в этой группе, не зависящее от ставки основного.
"""
from alembic import op
import sqlalchemy as sa


revision = "0230"
down_revision = "0229"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "group_trainer_rate_history",
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index(
        "ix_group_trainer_rate_history_trainer_id",
        "group_trainer_rate_history",
        ["trainer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_group_trainer_rate_history_trainer_id", table_name="group_trainer_rate_history")
    op.drop_column("group_trainer_rate_history", "trainer_id")
