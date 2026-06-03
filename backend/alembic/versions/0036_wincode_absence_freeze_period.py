"""WinCode ТЗ: причины отсутствия, отработки, период, заморозка, совместимость программ

Revision ID: 0036_wincode_absence_freeze_period
Revises: 0035_tochka_applied_payments
Create Date: 2026-02-22

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0036_wincode_absence_freeze_period"
down_revision = "0035_tochka_applied_payments"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()

    # lesson_attendance: причины отсутствия (Был / Не был / Болел / Олимпиада / Мероприятие / Другое)
    if not _column_exists(conn, "lesson_attendance", "absence_reason"):
        op.add_column("lesson_attendance", sa.Column("absence_reason", sa.String(64), nullable=True))
    if not _column_exists(conn, "lesson_attendance", "absence_comment"):
        op.add_column("lesson_attendance", sa.Column("absence_comment", sa.Text(), nullable=True))

    # absence_follow_ups: назначенная отработка + причина для списка менеджера
    if not _column_exists(conn, "absence_follow_ups", "makeup_group_id"):
        op.add_column("absence_follow_ups", sa.Column("makeup_group_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_absence_follow_ups_makeup_group", "absence_follow_ups", "groups", ["makeup_group_id"], ["id"]
        )
    if not _column_exists(conn, "absence_follow_ups", "makeup_lesson_date"):
        op.add_column("absence_follow_ups", sa.Column("makeup_lesson_date", sa.Date(), nullable=True))
    if not _column_exists(conn, "absence_follow_ups", "absence_reason"):
        op.add_column("absence_follow_ups", sa.Column("absence_reason", sa.String(64), nullable=True))
    if not _column_exists(conn, "absence_follow_ups", "absence_comment"):
        op.add_column("absence_follow_ups", sa.Column("absence_comment", sa.Text(), nullable=True))

    # student_cards: период обучения и дата следующей оплаты
    if not _column_exists(conn, "student_cards", "learning_period_start"):
        op.add_column("student_cards", sa.Column("learning_period_start", sa.Date(), nullable=True))
    if not _column_exists(conn, "student_cards", "next_payment_date"):
        op.add_column("student_cards", sa.Column("next_payment_date", sa.Date(), nullable=True))

    # student_freezes: заморозка по запросу родителя (только owner)
    if not _table_exists(conn, "student_freezes"):
        op.create_table(
            "student_freezes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("freeze_start", sa.Date(), nullable=False),
            sa.Column("freeze_end", sa.Date(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_student_freezes_student_id", "student_freezes", ["student_id"], if_not_exists=True)
        op.create_index("ix_student_freezes_freeze_end", "student_freezes", ["freeze_end"], if_not_exists=True)

    # program_makeup_compatibility: конфигурируемая матрица для подбора отработок
    if not _table_exists(conn, "program_makeup_compatibility"):
        op.create_table(
            "program_makeup_compatibility",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("source_program_id", sa.Integer(), nullable=False),
            sa.Column("target_program_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["source_program_id"], ["programs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["target_program_id"], ["programs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("source_program_id", "target_program_id", name="uq_makeup_compat_source_target"),
        )
        op.create_index("ix_program_makeup_compatibility_source", "program_makeup_compatibility", ["source_program_id"], if_not_exists=True)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "program_makeup_compatibility"):
        op.drop_index("ix_program_makeup_compatibility_source", table_name="program_makeup_compatibility")
        op.drop_table("program_makeup_compatibility")
    if _table_exists(conn, "student_freezes"):
        op.drop_index("ix_student_freezes_freeze_end", table_name="student_freezes")
        op.drop_index("ix_student_freezes_student_id", table_name="student_freezes")
        op.drop_table("student_freezes")
    if _column_exists(conn, "student_cards", "next_payment_date"):
        op.drop_column("student_cards", "next_payment_date")
    if _column_exists(conn, "student_cards", "learning_period_start"):
        op.drop_column("student_cards", "learning_period_start")
    if _column_exists(conn, "absence_follow_ups", "absence_comment"):
        op.drop_column("absence_follow_ups", "absence_comment")
    if _column_exists(conn, "absence_follow_ups", "absence_reason"):
        op.drop_column("absence_follow_ups", "absence_reason")
    if _column_exists(conn, "absence_follow_ups", "makeup_lesson_date"):
        op.drop_column("absence_follow_ups", "makeup_lesson_date")
    if _column_exists(conn, "absence_follow_ups", "makeup_group_id"):
        op.drop_constraint("fk_absence_follow_ups_makeup_group", "absence_follow_ups", type_="foreignkey")
        op.drop_column("absence_follow_ups", "makeup_group_id")
    if _column_exists(conn, "lesson_attendance", "absence_comment"):
        op.drop_column("lesson_attendance", "absence_comment")
    if _column_exists(conn, "lesson_attendance", "absence_reason"):
        op.drop_column("lesson_attendance", "absence_reason")
