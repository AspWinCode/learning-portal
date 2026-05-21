"""0092: parent experience foundation

Revision ID: 0092_parent_experience_foundation
Revises: 0091_communication_hub_queue
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0092_parent_experience_foundation"
down_revision = "0091_communication_hub_queue"
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


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "parent_questions"):
        op.create_table(
            "parent_questions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("parent_user_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("target_trainer_id", sa.Integer(), nullable=True),
            sa.Column("topic", sa.String(length=255), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
            sa.ForeignKeyConstraint(["target_trainer_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_parent_questions_parent_user_id", "parent_questions", ["parent_user_id"], unique=False)
        op.create_index("ix_parent_questions_student_id", "parent_questions", ["student_id"], unique=False)
        op.create_index("ix_parent_questions_target_trainer_id", "parent_questions", ["target_trainer_id"], unique=False)
        op.create_index("ix_parent_questions_status", "parent_questions", ["status"], unique=False)
        op.create_index("ix_parent_questions_created_at", "parent_questions", ["created_at"], unique=False)

    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM sms_templates WHERE event_key = :event_key AND channel = :channel LIMIT 1"
        ),
        {"event_key": "parent_weekly_digest", "channel": "email"},
    ).scalar()
    if exists is None:
        conn.execute(
            sa.text(
                """
                INSERT INTO sms_templates (name, category, event_key, channel, subject, text, active, created_at)
                VALUES (:name, :category, :event_key, :channel, :subject, :text, true, now())
                """
            ),
            {
                "name": "Родителю: weekly digest",
                "category": "parent_dashboard",
                "event_key": "parent_weekly_digest",
                "channel": "email",
                "subject": "Еженедельный отчёт: {student_name}",
                "text": (
                    "Здравствуйте. Еженедельный отчёт по {student_name}: "
                    "посещено занятий {lessons_attended_count}, пропущено {lessons_missed_count}, "
                    "новых оценок {new_grades_count}, прогресс программы {progress_percent}%. "
                    "Ближайшее занятие: {nearest_lesson_date} {nearest_lesson_time} {nearest_lesson_group}."
                ),
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM sms_templates WHERE event_key = :event_key AND channel = :channel"
        ),
        {"event_key": "parent_weekly_digest", "channel": "email"},
    )
    if _table_exists(conn, "parent_questions"):
        op.drop_index("ix_parent_questions_created_at", table_name="parent_questions")
        op.drop_index("ix_parent_questions_status", table_name="parent_questions")
        op.drop_index("ix_parent_questions_target_trainer_id", table_name="parent_questions")
        op.drop_index("ix_parent_questions_student_id", table_name="parent_questions")
        op.drop_index("ix_parent_questions_parent_user_id", table_name="parent_questions")
        op.drop_table("parent_questions")
