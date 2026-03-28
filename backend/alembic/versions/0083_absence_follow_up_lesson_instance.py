"""0083: add lesson_instance_id to absence_follow_ups, make lesson_attendance_id nullable

Revision ID: 0083_absence_follow_up_lesson_instance
Revises: 0082_lesson_instances
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0083_absence_follow_up_lesson_instance"
down_revision = "0082_lesson_instances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Добавляем lesson_instance_id
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

    # Делаем lesson_attendance_id nullable (старые записи остаются, новые создаются без него)
    try:
        # Удаляем unique constraint если есть
        op.drop_constraint(
            "absence_follow_ups_lesson_attendance_id_key",
            "absence_follow_ups",
            type_="unique",
        )
    except Exception:
        pass  # уже не существует

    try:
        op.alter_column(
            "absence_follow_ups",
            "lesson_attendance_id",
            nullable=True,
        )
    except Exception:
        pass  # уже nullable

    # Делаем group_id nullable (для ручных уроков без группы)
    try:
        op.alter_column(
            "absence_follow_ups",
            "group_id",
            nullable=True,
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("ix_absence_follow_ups_lesson_instance_id", table_name="absence_follow_ups")
    except Exception:
        pass
    try:
        op.drop_column("absence_follow_ups", "lesson_instance_id")
    except Exception:
        pass
