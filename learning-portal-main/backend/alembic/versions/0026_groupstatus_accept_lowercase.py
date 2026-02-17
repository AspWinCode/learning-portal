"""Allow groupstatus enum to accept both lowercase and uppercase values

Revision ID: 0026_groupstatus_accept_lowercase
Revises: 0025_group_schedule_and_lesson_attendance
Create Date: 2026-02-17

Если в БД enum groupstatus создан с значениями ACTIVE/ARCHIVED, приложение может
отправлять 'active'. Добавляем значения в нижнем регистре, чтобы оба варианта работали.
"""
from alembic import op


revision = "0026_groupstatus_accept_lowercase"
down_revision = "0025_group_schedule_and_lesson_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем lowercase-значения, если в БД были только uppercase — запросы с 'active' начнут проходить
    op.execute("ALTER TYPE groupstatus ADD VALUE IF NOT EXISTS 'active'")
    op.execute("ALTER TYPE groupstatus ADD VALUE IF NOT EXISTS 'archived'")


def downgrade() -> None:
    # В PostgreSQL нельзя удалить значение из enum без пересоздания типа — оставляем пусто
    pass
