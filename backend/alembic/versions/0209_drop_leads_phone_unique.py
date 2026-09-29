"""sales: убрать уникальность phone_normalized у leads — у одного родителя
может быть несколько лидов (по одному на ребёнка) с одним телефоном.

Продолжение 0208. uq_leads_phone_normalized (0094) точно так же
противоречит остальной логике продукта: /api/v1/sales/search уже
запрашивает лиды по телефону через .all() (ожидает несколько), а
дедупликация лидов на уровне приложения (_find_existing_lead_for_child)
и так не даёт плодить дубли для одного и того же ребёнка. Жёсткий
уникальный индекс в БД просто ломает второй лид для второго ребёнка
той же семьи (UniqueViolation).

Revision ID: 0209
Revises: 0208
Create Date: 2026-09-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0209"
down_revision = "0208"
branch_labels = None
depends_on = None


def _index_exists(conn, name: str) -> bool:
    result = conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :name"), {"name": name}
    ).first()
    return result is not None


def upgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, "uq_leads_phone_normalized"):
        op.drop_index("uq_leads_phone_normalized", table_name="leads")
    if not _index_exists(conn, "ix_leads_phone_normalized"):
        op.create_index("ix_leads_phone_normalized", "leads", ["phone_normalized"])


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, "ix_leads_phone_normalized"):
        op.drop_index("ix_leads_phone_normalized", table_name="leads")
    if not _index_exists(conn, "uq_leads_phone_normalized"):
        conn.execute(
            sa.text(
                "CREATE UNIQUE INDEX uq_leads_phone_normalized "
                "ON leads (phone_normalized) WHERE phone_normalized IS NOT NULL"
            )
        )
