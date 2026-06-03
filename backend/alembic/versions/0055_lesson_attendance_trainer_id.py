"""Add trainer_id to lesson_attendance for historical trainer tracking

Revision ID: 0055_lesson_attendance_trainer_id
Revises: 0054_campaigns_school_campaigns
Create Date: 2026-03-02

Колонка trainer_id фиксирует, какой тренер фактически вёл занятие.
Используется для страницы «Уроки» и расчётов, чтобы смена тренера в группе
не переписывала историю прошедших уроков.
"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0055_lesson_attendance_trainer_id"
down_revision = "0054_campaigns_school_campaigns"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "lesson_attendance", "trainer_id"):
        op.add_column(
            "lesson_attendance",
            sa.Column("trainer_id", sa.Integer(), nullable=True),
        )
        op.create_index(
            "ix_lesson_attendance_trainer_id",
            "lesson_attendance",
            ["trainer_id"],
            unique=False,
            if_not_exists=True,
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "lesson_attendance", "trainer_id"):
        op.drop_index("ix_lesson_attendance_trainer_id", table_name="lesson_attendance")
        op.drop_column("lesson_attendance", "trainer_id")

