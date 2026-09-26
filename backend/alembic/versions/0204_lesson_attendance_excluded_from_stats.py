"""Add excluded_from_attendance_stats to lesson_attendance.

Revision ID: 0204
Revises: 0203
Create Date: 2026-09-26

Когда отработка пропуска проводится отдельным реальным уроком (в другой
группе/дате), для этого урока создаётся своя запись LessonAttendance.
Кредит за отработку при этом отдаётся исходному пропущенному уроку
(его attended переключается в True — см. credit_makeup_for_absence),
поэтому запись самой отработки нужно исключить из подсчёта
«Количество посещений», иначе один и тот же пропуск задваивается:
и пропуск пропадает, и появляется лишний "новый" урок.
"""
from alembic import op
import sqlalchemy as sa


revision = "0204"
down_revision = "0203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lesson_attendance",
        sa.Column("excluded_from_attendance_stats", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("lesson_attendance", "excluded_from_attendance_stats")
