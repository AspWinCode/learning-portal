"""Add sms_messages and sms_templates tables for SMS Gateway integration.

Revision ID: 0072_sms
Revises: 0071_campaign_events
Create Date: 2026-03-15

"""

from alembic import op
import sqlalchemy as sa


revision = "0072_sms"
down_revision = "0071_campaign_events"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": name},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "sms_messages"):
        op.create_table(
            "sms_messages",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("phone", sa.String(length=32), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("entity_type", sa.String(length=32), nullable=True),
            sa.Column("entity_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
            sa.Column("gateway_id", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_sms_messages_phone"), "sms_messages", ["phone"], unique=False)
        op.create_index(op.f("ix_sms_messages_entity_type"), "sms_messages", ["entity_type"], unique=False)
        op.create_index(op.f("ix_sms_messages_entity_id"), "sms_messages", ["entity_id"], unique=False)
        op.create_index(op.f("ix_sms_messages_status"), "sms_messages", ["status"], unique=False)
        op.create_index(op.f("ix_sms_messages_created_by"), "sms_messages", ["created_by"], unique=False)
    if not _table_exists(conn, "sms_templates"):
        op.create_table(
            "sms_templates",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=256), nullable=False),
            sa.Column("category", sa.String(length=64), nullable=True),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_sms_templates_name"), "sms_templates", ["name"], unique=False)
        op.create_index(op.f("ix_sms_templates_category"), "sms_templates", ["category"], unique=False)
        op.create_index(op.f("ix_sms_templates_active"), "sms_templates", ["active"], unique=False)

    # Seed примеров шаблонов из ТЗ
    if _table_exists(conn, "sms_templates"):
        r = conn.execute(sa.text("SELECT COUNT(*) FROM sms_templates")).scalar()
        if r == 0:
            conn.execute(
                sa.text("""
                    INSERT INTO sms_templates (name, category, text, active, created_at)
                    VALUES
                    ('Недозвон', 'leads', 'Здравствуйте! Пытались дозвониться из академии WinCode. Подскажите, когда будет удобно поговорить?', true, now()),
                    ('Напоминание о мероприятии', 'events', 'Напоминаем о мероприятии WinCode сегодня в {time}. Адрес: {location}', true, now()),
                    ('Приглашение в Telegram', 'leads', 'Чтобы получать уведомления об уроках, подключите Telegram-бота: {bot_link}', true, now())
                """)
            )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "sms_templates"):
        op.drop_index(op.f("ix_sms_templates_active"), table_name="sms_templates")
        op.drop_index(op.f("ix_sms_templates_category"), table_name="sms_templates")
        op.drop_index(op.f("ix_sms_templates_name"), table_name="sms_templates")
        op.drop_table("sms_templates")
    if _table_exists(conn, "sms_messages"):
        op.drop_index(op.f("ix_sms_messages_created_by"), table_name="sms_messages")
        op.drop_index(op.f("ix_sms_messages_status"), table_name="sms_messages")
        op.drop_index(op.f("ix_sms_messages_entity_id"), table_name="sms_messages")
        op.drop_index(op.f("ix_sms_messages_entity_type"), table_name="sms_messages")
        op.drop_index(op.f("ix_sms_messages_phone"), table_name="sms_messages")
        op.drop_table("sms_messages")
