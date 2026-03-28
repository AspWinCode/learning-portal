"""0091: add lesson_instance_id to absence_follow_ups, make lesson_attendance_id nullable

Revision ID: 0091_absence_follow_up_lesson_instance
Revises: 0090_lesson_instances
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0091_absence_follow_up_lesson_instance"
down_revision = "0090_lesson_instances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Добавляем lesson_instance_id если его ещё нет
    has_col = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='absence_follow_ups' AND column_name='lesson_instance_id'"
    )).fetchone()
    if not has_col:
        op.add_column(
            "absence_follow_ups",
            sa.Column(
                "lesson_instance_id",
                sa.Integer,
                sa.ForeignKey("lesson_instances.id"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_absence_follow_ups_lesson_instance_id",
            "absence_follow_ups",
            ["lesson_instance_id"],
        )

    # 2. Удаляем unique constraint на lesson_attendance_id (через IF EXISTS — не абортирует транзакцию)
    conn.execute(sa.text(
        "ALTER TABLE absence_follow_ups "
        "DROP CONSTRAINT IF EXISTS absence_follow_ups_lesson_attendance_id_key"
    ))

    # 3. Делаем lesson_attendance_id nullable — только если сейчас NOT NULL
    row = conn.execute(sa.text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name='absence_follow_ups' AND column_name='lesson_attendance_id'"
    )).fetchone()
    if row and row[0] == 'NO':
        op.alter_column("absence_follow_ups", "lesson_attendance_id", nullable=True)

    # 4. Делаем group_id nullable — только если сейчас NOT NULL
    row2 = conn.execute(sa.text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name='absence_follow_ups' AND column_name='group_id'"
    )).fetchone()
    if row2 and row2[0] == 'NO':
        op.alter_column("absence_follow_ups", "group_id", nullable=True)


def downgrade() -> None:
    try:
        op.drop_index("ix_absence_follow_ups_lesson_instance_id", table_name="absence_follow_ups")
    except Exception:
        pass
    try:
        op.drop_column("absence_follow_ups", "lesson_instance_id")
    except Exception:
        pass
