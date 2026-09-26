"""Add per-group trainer rate overrides to groups.

Revision ID: 0203
Revises: 0202
Create Date: 2026-09-26

Разные группы у одного тренера могут стоить по-разному (например, 400 ₽ за
урок в одной группе и 800 ₽ в другой). Раньше ставка была только на уровне
тренера (users.trainer_rate / trainer_rate_per_hour), что не позволяло это
выразить. Эти два новых поля на groups — необязательное переопределение
ставки конкретно для этой группы; если NULL, расчёт берёт ставку тренера.
"""
from alembic import op
import sqlalchemy as sa


revision = "0203"
down_revision = "0202"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("trainer_rate", sa.Float(), nullable=True))
    op.add_column("groups", sa.Column("trainer_rate_per_hour", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("groups", "trainer_rate_per_hour")
    op.drop_column("groups", "trainer_rate")
