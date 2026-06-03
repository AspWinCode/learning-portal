"""0091: communication hub queue and template metadata

Revision ID: 0091_communication_hub_queue
Revises: 0090_custom_roles_foundation
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0091_communication_hub_queue"
down_revision = "0090_custom_roles_foundation"
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


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "sms_templates", "event_key"):
        op.add_column("sms_templates", sa.Column("event_key", sa.String(length=128), nullable=True))
    if not _column_exists(conn, "sms_templates", "channel"):
        op.add_column("sms_templates", sa.Column("channel", sa.String(length=32), nullable=False, server_default="sms"))
    if not _column_exists(conn, "sms_templates", "subject"):
        op.add_column("sms_templates", sa.Column("subject", sa.String(length=255), nullable=True))

    op.execute("CREATE INDEX IF NOT EXISTS ix_sms_templates_event_key ON sms_templates (event_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sms_templates_channel ON sms_templates (channel)")

    if not _table_exists(conn, "communication_queue"):
        op.create_table(
            "communication_queue",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("recipient_type", sa.String(length=32), nullable=False),
            sa.Column("recipient_id", sa.Integer(), nullable=False),
            sa.Column("channel", sa.String(length=32), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("dedupe_key", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["template_id"], ["sms_templates.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_communication_queue_recipient_type", "communication_queue", ["recipient_type"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_recipient_id", "communication_queue", ["recipient_id"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_channel", "communication_queue", ["channel"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_template_id", "communication_queue", ["template_id"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_status", "communication_queue", ["status"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_last_attempt_at", "communication_queue", ["last_attempt_at"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_sent_at", "communication_queue", ["sent_at"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_dedupe_key", "communication_queue", ["dedupe_key"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_created_at", "communication_queue", ["created_at"], unique=False, if_not_exists=True)
        op.create_index("ix_communication_queue_created_by", "communication_queue", ["created_by"], unique=False, if_not_exists=True)

    seed_rows = [
        {
            "name": "Родителю: пропуск ученика",
            "category": "attendance",
            "event_key": "student_absent",
            "channel": "email",
            "subject": "Пропуск занятия: {student_name}",
            "text": "Здравствуйте. {student_name} отмечен отсутствующим на занятии {lesson_date} {lesson_time} в группе {group_name}.",
        },
        {
            "name": "Родителю: перенос занятия",
            "category": "schedule",
            "event_key": "lesson_cancelled",
            "channel": "email",
            "subject": "Перенос занятия: {group_name}",
            "text": "Здравствуйте. Занятие {group_name} на {lesson_date} {lesson_time} перенесено. Тренер: {trainer_name}.",
        },
        {
            "name": "Родителю: напоминание об оплате",
            "category": "payment",
            "event_key": "payment_reminder",
            "channel": "email",
            "subject": "Напоминание об оплате",
            "text": "Здравствуйте. Напоминаем об оплате по ученику {student_name}. Сумма к оплате: {amount}.",
        },
        {
            "name": "Родителю: характеристика опубликована",
            "category": "characteristics",
            "event_key": "characteristic_approved",
            "channel": "email",
            "subject": "Опубликована характеристика: {student_name}",
            "text": "Здравствуйте. Для ученика {student_name} опубликована новая характеристика.",
        },
    ]
    for row in seed_rows:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM sms_templates WHERE event_key = :event_key AND channel = :channel LIMIT 1"
            ),
            {"event_key": row["event_key"], "channel": row["channel"]},
        ).scalar()
        if exists is None:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO sms_templates (name, category, event_key, channel, subject, text, active, created_at)
                    VALUES (:name, :category, :event_key, :channel, :subject, :text, true, now())
                    """
                ),
                row,
            )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "communication_queue"):
        op.drop_index("ix_communication_queue_created_by", table_name="communication_queue")
        op.drop_index("ix_communication_queue_created_at", table_name="communication_queue")
        op.drop_index("ix_communication_queue_dedupe_key", table_name="communication_queue")
        op.drop_index("ix_communication_queue_sent_at", table_name="communication_queue")
        op.drop_index("ix_communication_queue_last_attempt_at", table_name="communication_queue")
        op.drop_index("ix_communication_queue_status", table_name="communication_queue")
        op.drop_index("ix_communication_queue_template_id", table_name="communication_queue")
        op.drop_index("ix_communication_queue_channel", table_name="communication_queue")
        op.drop_index("ix_communication_queue_recipient_id", table_name="communication_queue")
        op.drop_index("ix_communication_queue_recipient_type", table_name="communication_queue")
        op.drop_table("communication_queue")

    op.execute("DROP INDEX IF EXISTS ix_sms_templates_channel")
    op.execute("DROP INDEX IF EXISTS ix_sms_templates_event_key")

    if _column_exists(conn, "sms_templates", "subject"):
        op.drop_column("sms_templates", "subject")
    if _column_exists(conn, "sms_templates", "channel"):
        op.drop_column("sms_templates", "channel")
    if _column_exists(conn, "sms_templates", "event_key"):
        op.drop_column("sms_templates", "event_key")
