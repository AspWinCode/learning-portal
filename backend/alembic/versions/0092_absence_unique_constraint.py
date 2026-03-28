"""0092: add unique constraint (lesson_instance_id, student_id) on absence_follow_ups

Revision ID: 0092_absence_unique_constraint
Revises: 0091_absence_follow_up_lesson_instance
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0092_absence_unique_constraint"
down_revision = "0091_absence_follow_up_lesson_instance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Проверяем, нет ли уже такого constraint
    exists = conn.execute(sa.text(
        "SELECT 1 FROM pg_constraint WHERE conname = 'uq_absence_lesson_instance_student'"
    )).fetchone()
    if not exists:
        # Удаляем дубликаты перед созданием constraint (оставляем самый старый)
        conn.execute(sa.text("""
            DELETE FROM absence_follow_ups a
            USING absence_follow_ups b
            WHERE a.lesson_instance_id IS NOT NULL
              AND a.lesson_instance_id = b.lesson_instance_id
              AND a.student_id = b.student_id
              AND a.id > b.id
        """))

        op.create_unique_constraint(
            "uq_absence_lesson_instance_student",
            "absence_follow_ups",
            ["lesson_instance_id", "student_id"],
        )


def downgrade() -> None:
    op.drop_constraint("uq_absence_lesson_instance_student", "absence_follow_ups", type_="unique")
