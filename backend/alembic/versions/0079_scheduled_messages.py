"""0079: отложенные сообщения — scheduled_at в sms_messages, таблица max_messages

Revision ID: 0079
Revises: 0078_leads_composite_indexes
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0079"
down_revision = "0078_leads_composite_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Добавить scheduled_at в sms_messages (если ещё нет)
    has_col = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='sms_messages' AND column_name='scheduled_at'"
    )).fetchone()
    if not has_col:
        op.add_column(
            "sms_messages",
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        )

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sms_messages_scheduled_at ON sms_messages (scheduled_at)"
    ))

    # Создать таблицу max_messages (если ещё нет)
    table_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name='max_messages'"
    )).fetchone()
    if not table_exists:
        op.create_table(
            "max_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("lead_id", sa.Integer, sa.ForeignKey("leads.id"), nullable=True),
            sa.Column("max_user_id", sa.Integer, nullable=True),
            sa.Column("phone", sa.String(32), nullable=True),
            sa.Column("chat_id", sa.String(64), nullable=True),
            sa.Column("message", sa.Text, nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
            sa.Column("provider", sa.String(32), nullable=True),
            sa.Column("gateway_message_id", sa.String(128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        )

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_max_messages_status ON max_messages (status)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_max_messages_scheduled_at ON max_messages (scheduled_at)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_max_messages_lead_id ON max_messages (lead_id)"
    ))


def downgrade() -> None:
    op.drop_index("ix_max_messages_lead_id", "max_messages")
    op.drop_index("ix_max_messages_scheduled_at", "max_messages")
    op.drop_index("ix_max_messages_status", "max_messages")
    op.drop_table("max_messages")
    op.drop_index("ix_sms_messages_scheduled_at", "sms_messages")
    op.drop_column("sms_messages", "scheduled_at")
