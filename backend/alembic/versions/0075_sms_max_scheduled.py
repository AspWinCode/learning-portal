"""Add scheduled_at for sms_messages and max_messages table.

Revision ID: 0075_sms_max_scheduled
Revises: 0074_lead_max_user_id
Create Date: 2026-03-16

"""

from alembic import op
import sqlalchemy as sa


revision = "0075_sms_max_scheduled"
down_revision = "0074_lead_max_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем scheduled_at в sms_messages (если таблица есть)
    conn = op.get_bind()
    if conn.dialect.has_table(conn, "sms_messages"):  # type: ignore[arg-type]
        op.add_column(
            "sms_messages",
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(
            op.f("ix_sms_messages_scheduled_at"),
            "sms_messages",
            ["scheduled_at"],
            unique=False,
        )

    # Создаём max_messages, если ещё нет
    if not conn.dialect.has_table(conn, "max_messages"):  # type: ignore[arg-type]
        op.create_table(
            "max_messages",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("lead_id", sa.Integer(), nullable=True),
            sa.Column("max_user_id", sa.Integer(), nullable=True),
            sa.Column("phone", sa.String(length=32), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="pending",
            ),
            sa.Column("gateway_message_id", sa.String(length=128), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_max_messages_lead_id"), "max_messages", ["lead_id"], unique=False)
        op.create_index(op.f("ix_max_messages_max_user_id"), "max_messages", ["max_user_id"], unique=False)
        op.create_index(op.f("ix_max_messages_phone"), "max_messages", ["phone"], unique=False)
        op.create_index(op.f("ix_max_messages_status"), "max_messages", ["status"], unique=False)
        op.create_index(op.f("ix_max_messages_created_by"), "max_messages", ["created_by"], unique=False)
        op.create_index(op.f("ix_max_messages_scheduled_at"), "max_messages", ["scheduled_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.has_table(conn, "sms_messages"):  # type: ignore[arg-type]
        op.drop_index(op.f("ix_sms_messages_scheduled_at"), table_name="sms_messages")
        op.drop_column("sms_messages", "scheduled_at")

    if conn.dialect.has_table(conn, "max_messages"):  # type: ignore[arg-type]
        op.drop_index(op.f("ix_max_messages_scheduled_at"), table_name="max_messages")
        op.drop_index(op.f("ix_max_messages_created_by"), table_name="max_messages")
        op.drop_index(op.f("ix_max_messages_status"), table_name="max_messages")
        op.drop_index(op.f("ix_max_messages_phone"), table_name="max_messages")
        op.drop_index(op.f("ix_max_messages_max_user_id"), table_name="max_messages")
        op.drop_index(op.f("ix_max_messages_lead_id"), table_name="max_messages")
        op.drop_table("max_messages")

