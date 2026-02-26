#!/bin/bash
# На сервере: заменить миграцию 0047 на идемпотентную версию (без git pull).
# Запустить из корня проекта:  cd ~/learning-portal && bash backend/alembic/versions/apply_0047_fix.sh
# Затем: docker compose build backend --no-cache && docker compose run --rm backend python -m alembic stamp 0046_custom_lessons && docker compose run --rm backend python -m alembic upgrade head && docker compose up -d backend

set -e
# Перейти в корень проекта (каталог, где лежит docker-compose.yml)
cd "$(dirname "$0")/../.."
F="backend/alembic/versions/0047_eight_lessons_units_extra.py"
cp "$F" "$F.bak.$(date +%s)"

cat > "$F" << 'ENDOFFILE'
"""8 занятий: units_per_session, base/extra units, lesson_slot_extra_policy.

Revision ID: 0047_eight_lessons
Revises: 0046_custom_lessons
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0047_eight_lessons"
down_revision = "0046_custom_lessons"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    if not _table_exists(conn, table):
        return False
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()

    # groups: units_per_session, extra_rate_per_unit
    if not _column_exists(conn, "groups", "units_per_session"):
        op.add_column("groups", sa.Column("units_per_session", sa.Integer(), nullable=False, server_default="1"))
    if not _column_exists(conn, "groups", "extra_rate_per_unit"):
        op.add_column("groups", sa.Column("extra_rate_per_unit", sa.Float(), nullable=True))

    # lesson_attendance: base_units_applied, extra_units_applied
    if not _column_exists(conn, "lesson_attendance", "base_units_applied"):
        op.add_column("lesson_attendance", sa.Column("base_units_applied", sa.Integer(), nullable=True))
    if not _column_exists(conn, "lesson_attendance", "extra_units_applied"):
        op.add_column("lesson_attendance", sa.Column("extra_units_applied", sa.Integer(), nullable=True))

    # kind в student_account_transactions — обычный VARCHAR (миграция 0022), не PG ENUM; значение 'extra_lesson_deduction' пишем как строку, менять тип не нужно

    # lesson_slot_extra_policy
    if not _table_exists(conn, "lesson_slot_extra_policy"):
        op.create_table(
            "lesson_slot_extra_policy",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("group_id", sa.Integer(), nullable=False, index=True),
            sa.Column("lesson_date", sa.Date(), nullable=False, index=True),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("extra_policy", sa.String(16), nullable=False, server_default="free"),
            sa.Column("extra_rate_per_unit", sa.Float(), nullable=True),
            sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
            sa.UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_lesson_slot_extra_policy_slot"),
        )
    # Индексы с IF NOT EXISTS на случай повторного запуска миграции (PostgreSQL)
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_id ON lesson_slot_extra_policy (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_group_id ON lesson_slot_extra_policy (group_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_lesson_date ON lesson_slot_extra_policy (lesson_date)")


def downgrade() -> None:
    op.drop_table("lesson_slot_extra_policy")
    op.drop_column("lesson_attendance", "extra_units_applied")
    op.drop_column("lesson_attendance", "base_units_applied")
    op.drop_column("groups", "extra_rate_per_unit")
    op.drop_column("groups", "units_per_session")
    # Postgres does not support removing enum value easily; leave extra_lesson_deduction
    pass
ENDOFFILE

echo "Файл заменён на идемпотентную версию. Проверка:"
grep -n "CREATE INDEX IF NOT EXISTS" "$F" | head -3
echo "Дальше выполните:"
echo "  docker compose build backend --no-cache"
echo "  docker compose run --rm backend python -m alembic stamp 0046_custom_lessons"
echo "  docker compose run --rm backend python -m alembic upgrade head"
echo "  docker compose up -d backend"
