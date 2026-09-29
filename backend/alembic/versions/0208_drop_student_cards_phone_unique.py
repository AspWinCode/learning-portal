"""sales: убрать уникальность phone_normalized у student_cards — у одного
родителя может быть несколько детей (карточек) с одним телефоном.

Индекс uq_student_cards_phone_normalized (0094) противоречит остальной
логике продукта (primary_for_bank_payments, sales.py:_pick_primary_student_
for_payment, /search по телефону — все явно рассчитаны на несколько карточек
на один телефон). Из-за него падала любая вторая анкета/карточка с тем же
телефоном родителя (UniqueViolation), включая новую фичу "второй ребёнок"
в публичных анкетах.

Revision ID: 0208
Revises: 0207
Create Date: 2026-09-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0208"
down_revision = "0207"
branch_labels = None
depends_on = None


def _index_exists(conn, name: str) -> bool:
    result = conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :name"), {"name": name}
    ).first()
    return result is not None


def upgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, "uq_student_cards_phone_normalized"):
        op.drop_index("uq_student_cards_phone_normalized", table_name="student_cards")
    if not _index_exists(conn, "ix_student_cards_phone_normalized"):
        op.create_index(
            "ix_student_cards_phone_normalized", "student_cards", ["phone_normalized"]
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, "ix_student_cards_phone_normalized"):
        op.drop_index("ix_student_cards_phone_normalized", table_name="student_cards")
    if not _index_exists(conn, "uq_student_cards_phone_normalized"):
        conn.execute(
            sa.text(
                "CREATE UNIQUE INDEX uq_student_cards_phone_normalized "
                "ON student_cards (phone_normalized) WHERE phone_normalized IS NOT NULL"
            )
        )
