"""Custom lessons (manual lessons without group).

Revision ID: 0046_custom_lessons
Revises: 0045_lead_post_visit_funnel
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0046_custom_lessons"
down_revision = "0045_lead_post_visit_funnel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum type for custom lesson type.
    # Создаём в БД, если ещё не существует (чтобы миграция была идемпотентной).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customlessontype') THEN
                CREATE TYPE customlessontype AS ENUM ('makeup', 'paid_extra', 'free_trial');
            END IF;
        END$$;
        """
    )
    custom_type = postgresql.ENUM(
        "makeup",
        "paid_extra",
        "free_trial",
        name="customlessontype",
        create_type=False,
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Таблица custom_lessons
    if "custom_lessons" not in tables:
        op.create_table(
            "custom_lessons",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("lesson_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("trainer_id", sa.Integer(), nullable=False),
            sa.Column("lesson_type", custom_type, nullable=False, server_default="makeup"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.ForeignKeyConstraint(["trainer_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        )

    # Индексы для custom_lessons (idempotent)
    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lessons_id ON custom_lessons (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lessons_lesson_date ON custom_lessons (lesson_date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lessons_trainer_id ON custom_lessons (trainer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lessons_lesson_type ON custom_lessons (lesson_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lessons_created_by_id ON custom_lessons (created_by_id)")

    # Таблица custom_lesson_students
    if "custom_lesson_students" not in tables:
        op.create_table(
            "custom_lesson_students",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("lesson_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("planned_absence_id", sa.Integer(), nullable=True),
            sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("absence_reason", sa.String(length=64), nullable=True),
            sa.Column("absence_comment", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["lesson_id"], ["custom_lessons.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["planned_absence_id"], ["absence_follow_ups.id"]),
        )

    op.execute("CREATE INDEX IF NOT EXISTS ix_custom_lesson_students_id ON custom_lesson_students (id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_custom_lesson_students_lesson_id ON custom_lesson_students (lesson_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_custom_lesson_students_student_id ON custom_lesson_students (student_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_custom_lesson_students_planned_absence_id "
        "ON custom_lesson_students (planned_absence_id)"
    )

    # Link from absence to custom lesson used as makeup
    cols = [c["name"] for c in inspector.get_columns("absence_follow_ups")]
    if "makeup_custom_lesson_id" not in cols:
        op.add_column(
            "absence_follow_ups",
            sa.Column("makeup_custom_lesson_id", sa.Integer(), nullable=True),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_absence_follow_ups_makeup_custom_lesson_id "
        "ON absence_follow_ups (makeup_custom_lesson_id)"
    )
    # Внешний ключ создаём обычным способом; на уже существующую БД он будет создан один раз.
    op.create_foreign_key(
        "fk_absence_follow_ups_makeup_custom_lesson_id",
        "absence_follow_ups",
        "custom_lessons",
        ["makeup_custom_lesson_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_absence_follow_ups_makeup_custom_lesson_id",
        "absence_follow_ups",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_absence_follow_ups_makeup_custom_lesson_id",
        table_name="absence_follow_ups",
    )
    op.drop_column("absence_follow_ups", "makeup_custom_lesson_id")

    op.drop_index("ix_custom_lesson_students_planned_absence_id", table_name="custom_lesson_students")
    op.drop_index("ix_custom_lesson_students_student_id", table_name="custom_lesson_students")
    op.drop_index("ix_custom_lesson_students_lesson_id", table_name="custom_lesson_students")
    op.drop_index("ix_custom_lesson_students_id", table_name="custom_lesson_students")
    op.drop_table("custom_lesson_students")

    op.drop_index("ix_custom_lessons_created_by_id", table_name="custom_lessons")
    op.drop_index("ix_custom_lessons_lesson_type", table_name="custom_lessons")
    op.drop_index("ix_custom_lessons_trainer_id", table_name="custom_lessons")
    op.drop_index("ix_custom_lessons_lesson_date", table_name="custom_lessons")
    op.drop_index("ix_custom_lessons_id", table_name="custom_lessons")
    op.drop_table("custom_lessons")

    custom_type = postgresql.ENUM(
        "makeup",
        "paid_extra",
        "free_trial",
        name="customlessontype",
    )
    custom_type.drop(op.get_bind(), checkfirst=True)

