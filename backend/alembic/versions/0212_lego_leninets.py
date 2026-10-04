"""LEGO — Ленинец: изолированный bounded context (дети, группы, занятия, посещаемость, оплаты)

Revision ID: 0212_lego_leninets
Revises: 0211_group_lesson_slots
Create Date: 2026-10-04

Новые таблицы не имеют FK на academic-таблицы (students, groups, lessons, lesson_attendance,
student_accounts). Общие связи только с users (тренер, создатель) и finance_transactions.

Что делает миграция:
1. lego_students / lego_groups / lego_group_students / lego_lessons / lego_attendance / lego_payments.
2. Уникальность посещаемости (lesson_id, student_id) и идемпотентность оплат (idempotency_key, finance_transaction_id).
3. Сидит finance target `leninets` (LEGO — Ленинец), если его ещё нет. Идемпотентно.

Откат удаляет таблицы LEGO. Target `leninets` не удаляется: на него могут ссылаться проводки.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0212_lego_leninets"
down_revision = "0211_group_lesson_slots"
branch_labels = None
depends_on = None


def _table_names(conn) -> set:
    return set(inspect(conn).get_table_names())


def _ensure_index(name: str, table: str, columns: list) -> None:
    op.create_index(name, table, columns)


def upgrade() -> None:
    conn = op.get_bind()
    existing = _table_names(conn)

    if "lego_students" not in existing:
        op.create_table(
            "lego_students",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("full_name", sa.String(256), nullable=False),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("parent_name", sa.String(256), nullable=True),
            sa.Column("parent_phone", sa.String(32), nullable=True),
            sa.Column("secondary_phone", sa.String(32), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="active"),
            sa.Column("payment_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("payment_period", sa.String(16), nullable=False, server_default="monthly"),
            sa.Column("payment_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("paid_until", sa.Date(), nullable=True),
            sa.Column("next_payment_date", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        _ensure_index("ix_lego_students_id", "lego_students", ["id"])
        _ensure_index("ix_lego_students_full_name", "lego_students", ["full_name"])
        _ensure_index("ix_lego_students_parent_phone", "lego_students", ["parent_phone"])
        _ensure_index("ix_lego_students_status", "lego_students", ["status"])
        _ensure_index("ix_lego_students_payment_active", "lego_students", ["payment_active"])
        _ensure_index("ix_lego_students_next_payment_date", "lego_students", ["next_payment_date"])

    if "lego_groups" not in existing:
        op.create_table(
            "lego_groups",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("location", sa.String(128), nullable=False, server_default="Ленинец"),
            sa.Column("weekday", sa.Integer(), nullable=True),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        _ensure_index("ix_lego_groups_id", "lego_groups", ["id"])
        _ensure_index("ix_lego_groups_trainer_id", "lego_groups", ["trainer_id"])
        _ensure_index("ix_lego_groups_status", "lego_groups", ["status"])

    if "lego_group_students" not in existing:
        op.create_table(
            "lego_group_students",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lego_group_id", sa.Integer(), sa.ForeignKey("lego_groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lego_student_id", sa.Integer(), sa.ForeignKey("lego_students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("joined_at", sa.Date(), nullable=False),
            sa.Column("left_at", sa.Date(), nullable=True),
        )
        _ensure_index("ix_lego_group_students_id", "lego_group_students", ["id"])
        _ensure_index("ix_lego_group_students_lego_group_id", "lego_group_students", ["lego_group_id"])
        _ensure_index("ix_lego_group_students_lego_student_id", "lego_group_students", ["lego_student_id"])

    if "lego_lessons" not in existing:
        op.create_table(
            "lego_lessons",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("group_id", sa.Integer(), sa.ForeignKey("lego_groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lesson_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="planned"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        _ensure_index("ix_lego_lessons_id", "lego_lessons", ["id"])
        _ensure_index("ix_lego_lessons_group_id", "lego_lessons", ["group_id"])
        _ensure_index("ix_lego_lessons_lesson_date", "lego_lessons", ["lesson_date"])
        _ensure_index("ix_lego_lessons_trainer_id", "lego_lessons", ["trainer_id"])
        _ensure_index("ix_lego_lessons_status", "lego_lessons", ["status"])

    if "lego_attendance" not in existing:
        op.create_table(
            "lego_attendance",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lego_lessons.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("lego_students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("marked_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("marked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("lesson_id", "student_id", name="uq_lego_attendance_lesson_student"),
        )
        _ensure_index("ix_lego_attendance_id", "lego_attendance", ["id"])
        _ensure_index("ix_lego_attendance_lesson_id", "lego_attendance", ["lesson_id"])
        _ensure_index("ix_lego_attendance_student_id", "lego_attendance", ["student_id"])

    if "lego_payments" not in existing:
        op.create_table(
            "lego_payments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("lego_students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("payment_date", sa.Date(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=True),
            sa.Column("period_end", sa.Date(), nullable=True),
            sa.Column("paid_until", sa.Date(), nullable=True),
            sa.Column("finance_transaction_id", sa.Integer(), sa.ForeignKey("finance_transactions.id"), nullable=True, unique=True),
            sa.Column("idempotency_key", sa.String(128), nullable=True, unique=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        _ensure_index("ix_lego_payments_id", "lego_payments", ["id"])
        _ensure_index("ix_lego_payments_student_id", "lego_payments", ["student_id"])
        _ensure_index("ix_lego_payments_payment_date", "lego_payments", ["payment_date"])

    # Сид finance target. Таблица finance_targets гарантированно существует (см. 0001–0200).
    conn.execute(
        sa.text(
            "INSERT INTO finance_targets (code, name, is_active, is_personal, created_at) "
            "SELECT 'leninets', 'LEGO — Ленинец', true, false, now() "
            "WHERE NOT EXISTS (SELECT 1 FROM finance_targets WHERE code = 'leninets')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    existing = _table_names(conn)
    # Порядок важен: сначала зависимые таблицы.
    for table in ("lego_payments", "lego_attendance", "lego_lessons", "lego_group_students", "lego_groups", "lego_students"):
        if table in existing:
            op.drop_table(table)
