"""Add student_accounts and student_account_transactions

Revision ID: 0022_student_accounts
Revises: 0021_student_card_source
Create Date: 2026-02-19

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0022_student_accounts"
down_revision = "0021_student_card_source"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_accounts"):
        op.create_table(
            "student_accounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("balance", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_student_accounts_student_id", "student_accounts", ["student_id"])
    if not _table_exists(conn, "student_account_transactions"):
        # Create enum only if not exists (PostgreSQL)
        op.execute(
            "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'studentaccounttransactionkind') THEN "
            "CREATE TYPE studentaccounttransactionkind AS ENUM ('payment', 'lesson_deduction'); END IF; END $$"
        )
        op.create_table(
            "student_account_transactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("account_id", sa.Integer(), sa.ForeignKey("student_accounts.id"), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("kind", sa.Enum("payment", "lesson_deduction", name="studentaccounttransactionkind", create_type=False), nullable=False),
            sa.Column("note", sa.String(), nullable=True),
            sa.Column("lesson_attendance_id", sa.Integer(), sa.ForeignKey("lesson_attendance.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.create_index("ix_student_account_transactions_account_id", "student_account_transactions", ["account_id"])
        op.create_index("ix_student_account_transactions_lesson_attendance_id", "student_account_transactions", ["lesson_attendance_id"])


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "student_account_transactions"):
        op.drop_index("ix_student_account_transactions_lesson_attendance_id", table_name="student_account_transactions")
        op.drop_index("ix_student_account_transactions_account_id", table_name="student_account_transactions")
        op.drop_table("student_account_transactions")
    if _table_exists(conn, "student_accounts"):
        op.drop_index("ix_student_accounts_student_id", table_name="student_accounts")
        op.drop_table("student_accounts")
    op.execute("DROP TYPE IF EXISTS studentaccounttransactionkind")
