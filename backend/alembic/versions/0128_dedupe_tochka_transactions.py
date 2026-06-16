"""dedupe tochka transactions

Revision ID: 0128_dedupe_tochka_transactions
Revises: 0127_project_document_folders
Create Date: 2026-06-16
"""

from alembic import op

revision = "0128_dedupe_tochka_transactions"
down_revision = "0127_project_document_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY
                        date(occurred_at),
                        amount,
                        direction,
                        coalesce(account_id, -1),
                        coalesce(counterparty_phone, ''),
                        coalesce(counterparty_name, ''),
                        coalesce(description_raw, '')
                    ORDER BY
                        CASE
                            WHEN status = 'applied' THEN 0
                            WHEN target_id IS NOT NULL OR article_id IS NOT NULL THEN 1
                            WHEN status = 'classified' THEN 2
                            ELSE 3
                        END,
                        id
                ) AS rn
            FROM finance_transactions
            WHERE bank_source = 'tochka'
        )
        DELETE FROM finance_transactions tx
        USING ranked r
        WHERE tx.id = r.id
          AND r.rn > 1
          AND tx.status <> 'applied'
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY
                        tochka_account_id,
                        payment_date,
                        amount,
                        coalesce(payer_phone, ''),
                        coalesce(payer_name, '')
                    ORDER BY
                        CASE
                            WHEN status = 'applied' THEN 0
                            WHEN status <> 'ignored' THEN 1
                            ELSE 2
                        END,
                        id
                ) AS rn
            FROM bank_transactions
            WHERE tochka_account_id IS NOT NULL
        )
        UPDATE bank_transactions bt
        SET status = 'ignored',
            student_id = NULL,
            student_account_id = NULL
        FROM ranked r
        WHERE bt.id = r.id
          AND r.rn > 1
          AND bt.status <> 'applied'
        """
    )


def downgrade() -> None:
    pass
