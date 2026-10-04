"""Разовые слоты группы, исключения из состава и уникальность посещаемости по слоту

Revision ID: 0211_group_lesson_slots
Revises: 0210
Create Date: 2026-10-03

Раньше разовый урок (create-slot) существовал только как запись LessonAttendance одного ученика,
а уникальность (group_id, lesson_date, student_id) не позволяла два урока группы в один день.

Что делает миграция:
1. Создаёт group_lesson_slots — самостоятельную сущность разового урока (группа, дата, время).
2. Создаёт lesson_roster_exclusions — ученики, удалённые из конкретного урока. Состав слота —
   все активные ученики группы минус исключения, поэтому удаление из урока нужно хранить отдельно
   (раньше оно было неявным: отсутствие строки посещаемости).
3. Проставляет время легаси-строкам посещаемости без времени, если в этот день у группы ровно
   один слот по расписанию (однозначно). Неоднозначные строки остаются с NULL.
4. Переносит уже существующие разовые уроки из посещаемости в group_lesson_slots: строки
   LessonAttendance с временем, которого нет в GroupSchedule на этот день недели.
5. Заменяет уникальность LessonAttendance на (group_id, lesson_date, student_id, lesson_start_time,
   lesson_end_time) NULLS NOT DISTINCT (PostgreSQL 15+; в проекте PostgreSQL 16), чтобы даже
   строки с NULL-временем не дублировались по ученику и дню.
"""

from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0211_group_lesson_slots"
down_revision = "0210"
branch_labels = None
depends_on = None

OLD_UQ = "uq_lesson_attendance_group_date_student"
NEW_UQ = "uq_lesson_attendance_group_date_student_slot"


def _unique_names(conn, table: str) -> set:
    return {c["name"] for c in inspect(conn).get_unique_constraints(table)}


def _table_names(conn) -> set:
    return set(inspect(conn).get_table_names())


def upgrade() -> None:
    conn = op.get_bind()

    if "group_lesson_slots" not in _table_names(conn):
        op.create_table(
            "group_lesson_slots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lesson_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_group_lesson_slot"),
        )
        op.create_index("ix_group_lesson_slots_id", "group_lesson_slots", ["id"])
        op.create_index("ix_group_lesson_slots_group_id", "group_lesson_slots", ["group_id"])
        op.create_index("ix_group_lesson_slots_lesson_date", "group_lesson_slots", ["lesson_date"])

    if "lesson_roster_exclusions" not in _table_names(conn):
        op.create_table(
            "lesson_roster_exclusions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lesson_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint(
                "group_id", "lesson_date", "start_time", "end_time", "student_id",
                name="uq_lesson_roster_exclusion",
            ),
        )
        op.create_index("ix_lesson_roster_exclusions_id", "lesson_roster_exclusions", ["id"])
        op.create_index("ix_lesson_roster_exclusions_group_id", "lesson_roster_exclusions", ["group_id"])
        op.create_index("ix_lesson_roster_exclusions_lesson_date", "lesson_roster_exclusions", ["lesson_date"])
        op.create_index("ix_lesson_roster_exclusions_student_id", "lesson_roster_exclusions", ["student_id"])

    # 3. Легаси-строки без времени: проставляем слот, только если на этот день недели у группы ровно один слот.
    # День недели в GroupSchedule: 0=Пн; EXTRACT(ISODOW) даёт 1=Пн, поэтому вычитаем 1.
    op.execute(
        """
        UPDATE lesson_attendance a
        SET lesson_start_time = gs.start_time, lesson_end_time = gs.end_time
        FROM group_schedules gs
        WHERE a.lesson_start_time IS NULL
          AND a.lesson_end_time IS NULL
          AND gs.group_id = a.group_id
          AND gs.day_of_week = EXTRACT(ISODOW FROM a.lesson_date)::int - 1
          AND (
            SELECT count(*) FROM group_schedules g2
            WHERE g2.group_id = a.group_id AND g2.day_of_week = gs.day_of_week
          ) = 1
        """
    )

    # 4. Бэкфилл: разовые уроки, которые сейчас живут только в посещаемости.
    op.execute(
        """
        INSERT INTO group_lesson_slots (group_id, lesson_date, start_time, end_time)
        SELECT DISTINCT a.group_id, a.lesson_date, a.lesson_start_time, a.lesson_end_time
        FROM lesson_attendance a
        WHERE a.lesson_start_time IS NOT NULL
          AND a.lesson_end_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM group_schedules gs
            WHERE gs.group_id = a.group_id
              AND gs.day_of_week = EXTRACT(ISODOW FROM a.lesson_date)::int - 1
              AND gs.start_time = a.lesson_start_time
              AND gs.end_time = a.lesson_end_time
          )
        ON CONFLICT ON CONSTRAINT uq_group_lesson_slot DO NOTHING
        """
    )

    # 5. Уникальность посещаемости по слоту. Старое имя снимаем, новое создаём с NULLS NOT DISTINCT
    # (SQL, т.к. alembic/SQLAlchemy-обёртка для этой опции зависит от версии).
    if OLD_UQ in _unique_names(conn, "lesson_attendance"):
        op.drop_constraint(OLD_UQ, "lesson_attendance", type_="unique")
    if NEW_UQ not in _unique_names(conn, "lesson_attendance"):
        op.execute(
            f"ALTER TABLE lesson_attendance ADD CONSTRAINT {NEW_UQ} "
            "UNIQUE NULLS NOT DISTINCT (group_id, lesson_date, student_id, lesson_start_time, lesson_end_time)"
        )


def downgrade() -> None:
    conn = op.get_bind()
    # Откат упадёт, если за один день у ученика есть два слота: старая уникальность этого не допускает.
    if NEW_UQ in _unique_names(conn, "lesson_attendance"):
        op.drop_constraint(NEW_UQ, "lesson_attendance", type_="unique")
    if OLD_UQ not in _unique_names(conn, "lesson_attendance"):
        op.create_unique_constraint(
            OLD_UQ,
            "lesson_attendance",
            ["group_id", "lesson_date", "student_id"],
        )
    if "lesson_roster_exclusions" in _table_names(conn):
        op.drop_table("lesson_roster_exclusions")
    if "group_lesson_slots" in _table_names(conn):
        op.drop_table("group_lesson_slots")
