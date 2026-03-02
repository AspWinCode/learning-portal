"""Unified Finance Ledger: accounts, targets, articles, transactions, recognition rules.

Revision ID: 0056_unified_finance_ledger
Revises: 0055_lesson_attendance_trainer_id
Create Date: 2026-03-02

Добавляет базовые таблицы единого финансового журнала и переносит существующие bank_transactions.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text, inspect
import hashlib


revision = "0056_unified_finance_ledger"
down_revision = "0055_lesson_attendance_trainer_id"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def upgrade() -> None:
    # --- Core tables ---
    op.create_table(
        "finance_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column(
            "owner_scope",
            sa.Enum(
                "business",
                "personal",
                "mixed",
                name="financeaccountownerscope",
            ),
            nullable=False,
            server_default="business",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("code", name="uq_finance_accounts_code"),
    )

    op.create_table(
        "finance_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("code", name="uq_finance_targets_code"),
    )

    op.create_table(
        "finance_articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column(
            "direction",
            sa.Enum(
                "income",
                "expense",
                name="financearticledirection",
            ),
            nullable=False,
        ),
        sa.Column(
            "cost_kind",
            sa.Enum(
                "variable",
                "fixed",
                "none",
                name="financearticlecostkind",
            ),
            nullable=False,
            server_default="none",
        ),
        sa.Column(
            "scope",
            sa.Enum(
                "academy",
                "personal",
                "any",
                name="financearticlescope",
            ),
            nullable=False,
            server_default="any",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "finance_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column(
            "direction",
            sa.Enum(
                "income",
                "expense",
                "transfer",
                name="financetransactiondirection",
            ),
            nullable=False,
        ),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("finance_accounts.id"), nullable=True),
        sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("finance_accounts.id"), nullable=True),
        sa.Column("transfer_group_id", sa.String(length=64), nullable=True),
        sa.Column("counterparty_name", sa.String(length=512), nullable=True),
        sa.Column("counterparty_phone", sa.String(length=32), nullable=True),
        sa.Column("description_raw", sa.Text(), nullable=True),
        sa.Column("bank_source", sa.String(length=32), nullable=True),
        sa.Column("bank_operation_id", sa.String(length=256), nullable=True),
        sa.Column("dedup_hash", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.Integer(), sa.ForeignKey("finance_targets.id"), nullable=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("finance_articles.id"), nullable=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "classified",
                "applied",
                name="financetransactionstatus",
            ),
            nullable=False,
            server_default="new",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "bank_source",
            "bank_operation_id",
            name="uq_finance_transactions_bank_source_operation_id",
        ),
        sa.UniqueConstraint(
            "bank_source",
            "dedup_hash",
            name="uq_finance_transactions_bank_source_dedup_hash",
        ),
    )

    op.create_table(
        "finance_recognition_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pattern", sa.String(length=512), nullable=False),
        sa.Column(
            "match_type",
            sa.Enum(
                "contains",
                "equals",
                "regex",
                name="financerecognitionmatchtype",
            ),
            nullable=False,
            server_default="contains",
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_id", sa.Integer(), sa.ForeignKey("finance_targets.id"), nullable=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("finance_articles.id"), nullable=True),
        sa.Column(
            "direction_override",
            sa.Enum(
                "income",
                "expense",
                "transfer",
                name="financerecognitiondirectionoverride",
            ),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- Seed reference data ---
    conn = op.get_bind()

    accounts_table = sa.table(
        "finance_accounts",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("owner_scope", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        accounts_table,
        [
            {"code": "tochka_ip", "name": "Точка ИП", "owner_scope": "business", "is_active": True},
            {"code": "alfa_business", "name": "Альфа Бизнес", "owner_scope": "business", "is_active": True},
            {"code": "sber", "name": "Сбер", "owner_scope": "personal", "is_active": True},
            {"code": "tinkoff", "name": "Тинькофф", "owner_scope": "personal", "is_active": True},
            {"code": "vtb", "name": "ВТБ", "owner_scope": "personal", "is_active": True},
            {"code": "alfa", "name": "Альфа (личная)", "owner_scope": "personal", "is_active": True},
        ],
    )

    targets_table = sa.table(
        "finance_targets",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        targets_table,
        [
            {"code": "academy", "name": "Академия", "is_active": True},
            {"code": "personal", "name": "Личные", "is_active": True},
            {"code": "leninets", "name": "Ленинец", "is_active": True},
            {"code": "gogol_mogol", "name": "Гоголь Моголь", "is_active": True},
            {"code": "side_job", "name": "Подработка", "is_active": True},
        ],
    )

    # --- Migrate existing bank_transactions into finance_transactions ---
    if _table_exists(conn, "bank_transactions"):
        tochka_account_id_row = conn.execute(
            text("SELECT id FROM finance_accounts WHERE code = 'tochka_ip'")
        ).fetchone()
        tochka_finance_account_id = tochka_account_id_row[0] if tochka_account_id_row else None

        academy_target_row = conn.execute(
            text("SELECT id FROM finance_targets WHERE code = 'academy'")
        ).fetchone()
        academy_target_id = academy_target_row[0] if academy_target_row else None

        rows = conn.execute(
            text(
                "SELECT id, operation_id, tochka_account_id, amount, payer_phone, payer_name, "
                "payment_date, status, student_id "
                "FROM bank_transactions"
            )
        ).fetchall()

        insert_stmt = text(
            """
            INSERT INTO finance_transactions (
                occurred_at,
                amount,
                direction,
                account_id,
                counterparty_name,
                counterparty_phone,
                bank_source,
                bank_operation_id,
                dedup_hash,
                target_id,
                student_id,
                status
            )
            VALUES (
                :occurred_at,
                :amount,
                :direction,
                :account_id,
                :counterparty_name,
                :counterparty_phone,
                :bank_source,
                :bank_operation_id,
                :dedup_hash,
                :target_id,
                :student_id,
                :status
            )
            ON CONFLICT (bank_source, bank_operation_id) DO NOTHING
            """
        )

        for row in rows:
            amount = row["amount"]
            if amount is None:
                continue

            bank_status = (row["status"] or "").lower()
            is_expense = amount < 0 or bank_status == "expense"
            direction = "expense" if is_expense else "income"

            if bank_status == "applied":
                tx_status = "applied"
            elif bank_status in ("expense", "no_match", "ambiguous"):
                tx_status = "classified"
            else:
                tx_status = "new"

            bank_source = "tochka" if row["tochka_account_id"] else "import_xlsx"

            dedup_seed = f"{bank_source}|{row['payment_date'] or ''}|{amount}|{(row['payer_name'] or '').strip()}|{(row['payer_phone'] or '').strip()}"
            dedup_hash = hashlib.sha1(dedup_seed.encode("utf-8")).hexdigest()

            account_id = tochka_finance_account_id if row["tochka_account_id"] and tochka_finance_account_id else None
            target_id = academy_target_id if row["student_id"] and academy_target_id else None

            params = {
                "occurred_at": row["payment_date"],
                "amount": amount,
                "direction": direction,
                "account_id": account_id,
                "counterparty_name": (row["payer_name"] or "").strip() or None,
                "counterparty_phone": (row["payer_phone"] or "").strip() or None,
                "bank_source": bank_source,
                "bank_operation_id": row["operation_id"],
                "dedup_hash": dedup_hash,
                "target_id": target_id,
                "student_id": row["student_id"],
                "status": tx_status,
            }
            conn.execute(insert_stmt, params)


def downgrade() -> None:
    op.drop_table("finance_recognition_rules")
    op.drop_table("finance_transactions")
    op.drop_table("finance_articles")
    op.drop_table("finance_targets")
    op.drop_table("finance_accounts")

