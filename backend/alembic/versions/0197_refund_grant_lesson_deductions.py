"""data: сторно автосписаний за занятия у учеников на гранте

Грантовики не платят; с 100e50d автосписание им отключено. Здесь разово
возвращаем на счета уже сделанные автосписания (проводки за урок, привязанные
к lesson_attendance): сумма проводки → 0, баланс счёта увеличивается на неё.
Ручные списания без привязки к уроку не трогаем.

Revision ID: 0197
Revises: 0196
Create Date: 2026-09-23
"""
from alembic import op

revision = "0197"
down_revision = "0196"
branch_labels = None
depends_on = None


_GRANT_DEDUCTIONS = """
    SELECT t.id, t.account_id, t.amount
    FROM student_account_transactions t
    JOIN student_accounts a ON a.id = t.account_id
    JOIN students s ON s.id = a.student_id
    LEFT JOIN student_cards c ON c.student_id = s.id
    WHERE t.kind IN ('lesson_deduction', 'extra_lesson_deduction')
      AND t.lesson_attendance_id IS NOT NULL
      AND t.amount < 0
      AND (s.on_grant IS TRUE OR c.on_grant IS TRUE)
"""


def upgrade() -> None:
    op.execute(f"""
        UPDATE student_accounts a
        SET balance = a.balance - g.total
        FROM (
            SELECT account_id, SUM(amount) AS total
            FROM ({_GRANT_DEDUCTIONS}) d
            GROUP BY account_id
        ) g
        WHERE a.id = g.account_id
    """)
    op.execute(f"""
        UPDATE student_account_transactions t
        SET amount = 0,
            note = COALESCE(t.note, '') || ' (грант — сторно)'
        WHERE t.id IN (SELECT id FROM ({_GRANT_DEDUCTIONS}) d)
    """)


def downgrade() -> None:
    # Данные не восстанавливаем: исходные суммы списаний грантовикам не нужны.
    pass
