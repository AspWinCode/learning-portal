"""Merge duplicate student accounts and enforce (student_id, name) uniqueness.

Revision ID: 0207
Revises: 0206
Create Date: 2026-09-28

`ensure_default_student_account`/`create_student_account` could race or be
called twice from different screens (Students / Finance) with no uniqueness
guard, silently creating a second "Основной" account for a student. Payments
and lesson deductions would then land on different accounts, so one of them
never accrued despite lessons being marked as held. This migration merges any
existing duplicates (oldest account wins, balances summed, transactions
repointed) and adds a unique constraint so it can't happen again.
"""
from alembic import op
import sqlalchemy as sa


revision = "0207"
down_revision = "0206"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    duplicate_groups = conn.execute(
        sa.text(
            """
            SELECT student_id, name
            FROM student_accounts
            GROUP BY student_id, name
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()

    for student_id, name in duplicate_groups:
        accounts = conn.execute(
            sa.text(
                """
                SELECT id, balance FROM student_accounts
                WHERE student_id = :student_id AND name = :name
                ORDER BY id ASC
                """
            ),
            {"student_id": student_id, "name": name},
        ).fetchall()

        keep_id = accounts[0].id
        duplicate_ids = [row.id for row in accounts[1:]]
        extra_balance = sum(row.balance or 0.0 for row in accounts[1:])

        conn.execute(
            sa.text(
                "UPDATE student_account_transactions SET account_id = :keep_id WHERE account_id = ANY(:dup_ids)"
            ),
            {"keep_id": keep_id, "dup_ids": duplicate_ids},
        )
        conn.execute(
            sa.text("UPDATE student_accounts SET balance = balance + :extra WHERE id = :keep_id"),
            {"extra": extra_balance, "keep_id": keep_id},
        )
        conn.execute(
            sa.text("DELETE FROM student_accounts WHERE id = ANY(:dup_ids)"),
            {"dup_ids": duplicate_ids},
        )

    op.create_unique_constraint(
        "uq_student_accounts_student_name", "student_accounts", ["student_id", "name"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_student_accounts_student_name", "student_accounts", type_="unique")
