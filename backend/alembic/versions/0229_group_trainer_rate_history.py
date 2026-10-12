"""Add group_trainer_rate_history so rate changes don't retroactively affect past periods.

Revision ID: 0229
Revises: 0228
Create Date: 2026-10-12

Ставка хранилась только как текущее значение на groups.trainer_rate —
смена ставки задним числом пересчитывала уже прошедшие периоды. Эта
таблица хранит снапшоты ставки по дате вступления в силу; расчёт за
конкретный урок берёт последнюю запись с effective_from <= дата урока.

Backfill: для каждой группы с заданной ставкой создаём одну запись
с effective_from в далёком прошлом (чтобы покрыть все уже существующие
уроки текущим значением ставки).
"""
from alembic import op
import sqlalchemy as sa


revision = "0229"
down_revision = "0228"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_trainer_rate_history",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False, index=True),
        sa.Column("rate_per_lesson", sa.Float(), nullable=True),
        sa.Column("rate_per_hour", sa.Float(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO group_trainer_rate_history (group_id, rate_per_lesson, rate_per_hour, effective_from)
            SELECT id, trainer_rate, trainer_rate_per_hour, DATE '2000-01-01'
            FROM groups
            WHERE trainer_rate IS NOT NULL OR trainer_rate_per_hour IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_table("group_trainer_rate_history")
