"""Воронка пропусков: lesson_attendance_id nullable + ON DELETE SET NULL.

При отмене слота посещаемость удаляется, но запись AbsenceFollowUp (пропуск
для sales) должна сохраниться — она отвязывается (lesson_attendance_id = NULL).
UNIQUE на lesson_attendance_id сохраняется: PostgreSQL допускает несколько NULL.

Revision ID: 0211
Revises: 0210
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0211"
down_revision = "0210"
branch_labels = None
depends_on = None

FK_NAME = "absence_follow_ups_lesson_attendance_id_fkey"


def upgrade() -> None:
    op.alter_column(
        "absence_follow_ups",
        "lesson_attendance_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.execute(f"ALTER TABLE absence_follow_ups DROP CONSTRAINT IF EXISTS {FK_NAME}")
    op.create_foreign_key(
        FK_NAME,
        "absence_follow_ups",
        "lesson_attendance",
        ["lesson_attendance_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Откат возможен только без «осиротевших» записей: их удаляем, иначе NOT NULL не применится.
    op.execute("DELETE FROM absence_follow_ups WHERE lesson_attendance_id IS NULL")
    op.execute(f"ALTER TABLE absence_follow_ups DROP CONSTRAINT IF EXISTS {FK_NAME}")
    op.create_foreign_key(
        FK_NAME,
        "absence_follow_ups",
        "lesson_attendance",
        ["lesson_attendance_id"],
        ["id"],
    )
    op.alter_column(
        "absence_follow_ups",
        "lesson_attendance_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
