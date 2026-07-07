"""dedupe tochka generic-name duplicates, follow-up (webhook vs statement)

Revision ID: 0139_dedupe_tochka_generic_name_duplicates_followup
Revises: 0138_fix_kodex_external_url
Create Date: 2026-07-07

Повторный прогон очистки из 0132: код до этой миграции не покрывал случай,
когда запись с реальным именем плательщика создавалась РАНЬШЕ, чем вебхук
с именем-заглушкой «ООО Банк Точка» по той же операции (см. фикс в
app/routers/sales_bank.py — _find_tochka_real_income_candidate_for_generic).
Это позволяло новым дублям накапливаться после 0132. Прогоняем ту же очистку.
"""

from alembic import op

revision = "0139_dedupe_tochka_generic_name_duplicates_followup"
down_revision = "0138_fix_kodex_external_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Шаг 1: банковские транзакции
    op.execute(
        """
        WITH generics AS (
            SELECT bt.id,
                   bt.tochka_account_id,
                   bt.payment_date,
                   bt.amount
            FROM bank_transactions bt
            WHERE bt.tochka_account_id IS NOT NULL
              AND bt.status NOT IN ('applied', 'ignored')
              AND bt.payer_phone IS NULL
              AND (
                  lower(coalesce(bt.payer_name, '')) LIKE '%банк точка%'
                  OR lower(coalesce(bt.payer_name, '')) LIKE '%bank tochka%'
              )
        ),
        has_real AS (
            SELECT DISTINCT g.id AS generic_id
            FROM generics g
            JOIN bank_transactions real ON (
                real.tochka_account_id = g.tochka_account_id
                AND real.payment_date    = g.payment_date
                AND real.amount          = g.amount
                AND real.status         != 'ignored'
                AND real.id             != g.id
                AND lower(coalesce(real.payer_name, '')) NOT LIKE '%банк точка%'
                AND lower(coalesce(real.payer_name, '')) NOT LIKE '%bank tochka%'
            )
        )
        UPDATE bank_transactions bt
        SET status            = 'ignored',
            student_id        = NULL,
            student_account_id = NULL
        FROM has_real hr
        WHERE bt.id = hr.generic_id
        """
    )

    # Шаг 2: записи финансового журнала
    op.execute(
        """
        DELETE FROM finance_transactions ft
        WHERE ft.bank_source = 'tochka'
          AND (
              lower(coalesce(ft.counterparty_name, '')) LIKE '%банк точка%'
              OR lower(coalesce(ft.counterparty_name, '')) LIKE '%bank tochka%'
          )
          AND ft.status != 'applied'
          AND EXISTS (
              SELECT 1
              FROM finance_transactions ft2
              WHERE ft2.bank_source = 'tochka'
                AND ft2.id != ft.id
                AND date(ft2.occurred_at) = date(ft.occurred_at)
                AND ft2.amount    = ft.amount
                AND ft2.direction = ft.direction
                AND lower(coalesce(ft2.counterparty_name, '')) NOT LIKE '%банк точка%'
                AND lower(coalesce(ft2.counterparty_name, '')) NOT LIKE '%bank tochka%'
          )
        """
    )


def downgrade() -> None:
    pass
