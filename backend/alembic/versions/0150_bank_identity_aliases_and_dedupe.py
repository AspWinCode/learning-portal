"""bank identity: aliases, purpose, canonical dates, conservative dedupe

Revision ID: 0150_bank_identity_aliases_and_dedupe
Revises: 0149_note_folders
Create Date: 2026-10-04

1. bank_transactions.purpose — назначение платежа (нужно для различения расходов).
2. bank_transaction_aliases — внешние ID одной операции из разных источников
   (paymentId вебхука, transactionId выписки, fingerprint XLSX).
3. Нормализация bank_transactions.payment_date к YYYY-MM-DD. Вебхук раньше писал дату
   как есть («2026-09-30T10:15:22+03:00»), поэтому сравнение по дате не находило пару.
   Дата с часовым поясом переводится в московское время банка, как в bank_identity.
4. Очистка дублей ТОЛЬКО для приходов с высокой уверенностью:
   generic-запись («ООО Банк Точка», без телефона, не applied) и ровно одна запись с тем же
   счётом, каноничной датой, суммой и реальным именем плательщика. Такая пара — одна
   операция: generic-запись скрывается (ignored), её внешний ID переносится алиасом на
   оставшуюся запись, FinanceTransaction generic-записи удаляется, если на неё нет ссылок
   из student_account_transactions и lego_payments.
   Applied-записи, неоднозначные кандидаты и РАСХОДЫ не трогаются: одинаковые расходы
   могут быть реальными разными переводами, их чистим вручную по отчёту.
"""

import re
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op

revision = "0150_bank_identity_aliases_and_dedupe"
down_revision = "0149_note_folders"
branch_labels = None
depends_on = None

_BANK_TZ = timezone(timedelta(hours=3))
_ISO_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE,
)


def _canonical_date(value):
    """Копия правила app/services/bank_identity.normalize_bank_operation_date.
    Миграция намеренно не импортирует код приложения: он может измениться позже."""
    if not value:
        return value
    text = str(value).strip()
    match = _ISO_RE.match(text)
    if not match:
        return text
    year, month, day, hour, minute, second, offset = match.groups()
    if not offset or not hour:
        return f"{year}-{month}-{day}"
    if offset.upper() == "Z":
        tz = timezone.utc
    else:
        sign = 1 if offset[0] == "+" else -1
        digits = offset[1:].replace(":", "")
        tz = timezone(sign * timedelta(hours=int(digits[:2]), minutes=int(digits[2:4])))
    aware = datetime(int(year), int(month), int(day), int(hour), int(minute), int(second or 0), tzinfo=tz)
    return aware.astimezone(_BANK_TZ).date().isoformat()


def upgrade() -> None:
    op.add_column("bank_transactions", sa.Column("purpose", sa.String(512), nullable=True))

    op.create_table(
        "bank_transaction_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "bank_transaction_id",
            sa.Integer(),
            sa.ForeignKey("bank_transactions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("external_id", sa.String(256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source", "external_id", name="uq_bank_transaction_aliases_source_external"),
    )
    op.create_index("ix_bank_transaction_aliases_bank_transaction_id", "bank_transaction_aliases", ["bank_transaction_id"])
    op.create_index("ix_bank_transaction_aliases_external_id", "bank_transaction_aliases", ["external_id"])

    # Шаг 1: канонические даты. Меняем только представление даты, календарный день не
    # сдвигается, кроме случая смещения пояса, где дата и есть банковская.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, payment_date FROM bank_transactions WHERE payment_date IS NOT NULL AND payment_date <> ''")
    ).fetchall()
    for row_id, raw_date in rows:
        canonical = _canonical_date(raw_date)
        if canonical != raw_date:
            conn.execute(
                sa.text("UPDATE bank_transactions SET payment_date = :d WHERE id = :id"),
                {"d": canonical, "id": row_id},
            )

    # Шаг 2: пары generic → enriched для приходов, строго однозначные.
    op.execute(
        """
        CREATE TEMP TABLE _tochka_dedupe_pairs ON COMMIT DROP AS
        WITH generics AS (
            SELECT g.id, g.operation_id, g.tochka_account_id, g.payment_date, g.amount
            FROM bank_transactions g
            WHERE g.tochka_account_id IS NOT NULL
              AND g.status NOT IN ('applied', 'ignored', 'expense')
              AND g.payer_phone IS NULL
              AND (
                  lower(coalesce(g.payer_name, '')) LIKE '%банк точка%'
                  OR lower(coalesce(g.payer_name, '')) LIKE '%bank tochka%'
              )
        ),
        matches AS (
            SELECT g.id AS generic_id, g.operation_id AS generic_op, e.id AS enriched_id
            FROM generics g
            JOIN bank_transactions e ON (
                e.tochka_account_id = g.tochka_account_id
                AND e.payment_date  = g.payment_date
                AND e.amount        = g.amount
                AND e.id           <> g.id
                AND e.status NOT IN ('ignored', 'expense')
                AND e.payer_name IS NOT NULL
                AND lower(e.payer_name) NOT LIKE '%банк точка%'
                AND lower(e.payer_name) NOT LIKE '%bank tochka%'
            )
        )
        SELECT generic_id, generic_op, min(enriched_id) AS enriched_id
        FROM matches
        GROUP BY generic_id, generic_op
        HAVING count(*) = 1
        """
    )
    op.execute(
        """
        INSERT INTO bank_transaction_aliases (bank_transaction_id, source, external_id, created_at)
        SELECT p.enriched_id, 'tochka_webhook', p.generic_op, now()
        FROM _tochka_dedupe_pairs p
        ON CONFLICT (source, external_id) DO NOTHING
        """
    )
    op.execute(
        """
        DELETE FROM finance_transactions ft
        USING bank_transactions g, _tochka_dedupe_pairs p
        WHERE g.id = p.generic_id
          AND ft.bank_source = 'tochka'
          AND ft.bank_operation_id = g.operation_id
          AND ft.status <> 'applied'
          AND NOT EXISTS (SELECT 1 FROM student_account_transactions sat WHERE sat.finance_transaction_id = ft.id)
          AND NOT EXISTS (SELECT 1 FROM lego_payments lp WHERE lp.finance_transaction_id = ft.id)
        """
    )
    op.execute(
        """
        UPDATE bank_transactions g
        SET status = 'ignored', student_id = NULL, student_account_id = NULL
        FROM _tochka_dedupe_pairs p
        WHERE g.id = p.generic_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_bank_transaction_aliases_external_id", table_name="bank_transaction_aliases")
    op.drop_index("ix_bank_transaction_aliases_bank_transaction_id", table_name="bank_transaction_aliases")
    op.drop_table("bank_transaction_aliases")
    op.drop_column("bank_transactions", "purpose")
