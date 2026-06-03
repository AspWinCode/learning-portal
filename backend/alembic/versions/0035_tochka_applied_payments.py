"""Add tochka_applied_payments table for deduplication of auto-import

Revision ID: 0035_tochka_applied_payments
Revises: 0034_lesson_attendance_call_late
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa


revision = "0035_tochka_applied_payments"
down_revision = "0034_lesson_attendance_call_late"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tochka_applied_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tochka_account_id", sa.String(64), nullable=False),
        sa.Column("payment_date", sa.String(32), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payer_name", sa.String(512), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("student_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["student_account_id"], ["student_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tochka_account_id", "payment_date", "amount", "payer_name",
            name="uq_tochka_applied_account_date_amount_payer",
        ),
    )
    op.create_index(op.f("ix_tochka_applied_payments_tochka_account_id", if_not_exists=True), "tochka_applied_payments", ["tochka_account_id"], unique=False)
    op.create_index(op.f("ix_tochka_applied_payments_student_id", if_not_exists=True), "tochka_applied_payments", ["student_id"], unique=False)
    op.create_index(op.f("ix_tochka_applied_payments_student_account_id", if_not_exists=True), "tochka_applied_payments", ["student_account_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tochka_applied_payments_student_account_id"), table_name="tochka_applied_payments")
    op.drop_index(op.f("ix_tochka_applied_payments_student_id"), table_name="tochka_applied_payments")
    op.drop_index(op.f("ix_tochka_applied_payments_tochka_account_id"), table_name="tochka_applied_payments")
    op.drop_table("tochka_applied_payments")
