"""0094: person phase1 sync

Revision ID: 0094_person_phase1_sync
Revises: 0093_personal_finance_db
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa
import re
from typing import List


revision = "0094_person_phase1_sync"
down_revision = "0093_personal_finance_db"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = :table_name"
        ),
        {"table_name": table_name},
    ).scalar() is not None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = :table_name AND column_name = :column_name"
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar() is not None


def _index_exists(conn, index_name: str) -> bool:
    return conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes "
            "WHERE schemaname = current_schema() AND indexname = :index_name"
        ),
        {"index_name": index_name},
    ).scalar() is not None


def _normalize_phone(raw) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    digits = re.sub(r"\D", "", raw.strip())
    if not digits:
        return ""
    if len(digits) == 10:
        return "+7" + digits
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits
    return "+" + digits


def _backfill_normalized_phones(conn, table_name: str, id_column: str, candidates: List[str]) -> None:
    rows = conn.execute(
        sa.text(
            f"SELECT {id_column}, {', '.join(candidates)} FROM {table_name} ORDER BY {id_column} ASC"
        )
    ).mappings().all()
    seen = set()
    for row in rows:
        normalized = ""
        for candidate in candidates:
            normalized = _normalize_phone(row.get(candidate))
            if normalized:
                break
        # Keep only the first non-null phone in each table so the unique index can be created safely.
        if normalized and normalized in seen:
            normalized = None
        elif normalized:
            seen.add(normalized)
        else:
            normalized = None
        conn.execute(
            sa.text(f"UPDATE {table_name} SET phone_normalized = :phone_normalized WHERE {id_column} = :row_id"),
            {"phone_normalized": normalized, "row_id": row[id_column]},
        )


def upgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, "users") and not _column_exists(conn, "users", "phone_normalized"):
        op.add_column("users", sa.Column("phone_normalized", sa.String(length=32), nullable=True))

    if _table_exists(conn, "leads") and not _column_exists(conn, "leads", "phone_normalized"):
        op.add_column("leads", sa.Column("phone_normalized", sa.String(length=32), nullable=True))
    if _table_exists(conn, "leads") and not _column_exists(conn, "leads", "student_card_id"):
        op.add_column("leads", sa.Column("student_card_id", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_leads_student_card_id", "leads", "student_cards", ["student_card_id"], ["id"])
        op.create_index("ix_leads_student_card_id", "leads", ["student_card_id"], unique=False)

    if _table_exists(conn, "student_cards") and not _column_exists(conn, "student_cards", "phone_normalized"):
        op.add_column("student_cards", sa.Column("phone_normalized", sa.String(length=32), nullable=True))

    if _table_exists(conn, "users"):
        _backfill_normalized_phones(conn, "users", "id", ["phone"])
    if _table_exists(conn, "student_cards"):
        _backfill_normalized_phones(conn, "student_cards", "id", ["parent_phone", "student_phone"])
    if _table_exists(conn, "leads"):
        _backfill_normalized_phones(conn, "leads", "id", ["parent_phone", "phone", "child_phone"])
        conn.execute(
            sa.text(
                """
                UPDATE leads
                SET student_card_id = sc.id
                FROM student_cards sc
                WHERE leads.student_card_id IS NULL
                  AND leads.converted_to_student_id IS NOT NULL
                  AND sc.student_id = leads.converted_to_student_id
                """
            )
        )

    if _table_exists(conn, "users") and not _index_exists(conn, "uq_users_phone_normalized"):
        conn.execute(sa.text("CREATE UNIQUE INDEX uq_users_phone_normalized ON users (phone_normalized) WHERE phone_normalized IS NOT NULL"))
    if _table_exists(conn, "leads") and not _index_exists(conn, "uq_leads_phone_normalized"):
        conn.execute(sa.text("CREATE UNIQUE INDEX uq_leads_phone_normalized ON leads (phone_normalized) WHERE phone_normalized IS NOT NULL"))
    if _table_exists(conn, "student_cards") and not _index_exists(conn, "uq_student_cards_phone_normalized"):
        conn.execute(sa.text("CREATE UNIQUE INDEX uq_student_cards_phone_normalized ON student_cards (phone_normalized) WHERE phone_normalized IS NOT NULL"))


def downgrade() -> None:
    conn = op.get_bind()

    if _index_exists(conn, "uq_student_cards_phone_normalized"):
        op.drop_index("uq_student_cards_phone_normalized", table_name="student_cards")
    if _index_exists(conn, "uq_leads_phone_normalized"):
        op.drop_index("uq_leads_phone_normalized", table_name="leads")
    if _index_exists(conn, "uq_users_phone_normalized"):
        op.drop_index("uq_users_phone_normalized", table_name="users")

    if _table_exists(conn, "leads") and _index_exists(conn, "ix_leads_student_card_id"):
        op.drop_index("ix_leads_student_card_id", table_name="leads")
    if _table_exists(conn, "leads") and _column_exists(conn, "leads", "student_card_id"):
        op.drop_constraint("fk_leads_student_card_id", "leads", type_="foreignkey")
        op.drop_column("leads", "student_card_id")

    if _table_exists(conn, "student_cards") and _column_exists(conn, "student_cards", "phone_normalized"):
        op.drop_column("student_cards", "phone_normalized")
    if _table_exists(conn, "leads") and _column_exists(conn, "leads", "phone_normalized"):
        op.drop_column("leads", "phone_normalized")
    if _table_exists(conn, "users") and _column_exists(conn, "users", "phone_normalized"):
        op.drop_column("users", "phone_normalized")
