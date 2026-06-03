"""0095: student activity timeline

Revision ID: 0095_student_activity_timeline
Revises: 0094_person_phase1_sync
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0095_student_activity_timeline"
down_revision = "0094_person_phase1_sync"
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
    if _table_exists(conn, "student_activity_log"):
        return

    op.create_table(
        "student_activity_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_activity_log_id", "student_activity_log", ["id"], unique=False, if_not_exists=True)
    op.create_index("ix_student_activity_log_student_id", "student_activity_log", ["student_id"], unique=False, if_not_exists=True)
    op.create_index("ix_student_activity_log_type", "student_activity_log", ["type"], unique=False, if_not_exists=True)
    op.create_index("ix_student_activity_log_created_by", "student_activity_log", ["created_by"], unique=False, if_not_exists=True)
    op.create_index("ix_student_activity_log_created_at", "student_activity_log", ["created_at"], unique=False, if_not_exists=True)


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "student_activity_log"):
        return

    op.drop_index("ix_student_activity_log_created_at", table_name="student_activity_log")
    op.drop_index("ix_student_activity_log_created_by", table_name="student_activity_log")
    op.drop_index("ix_student_activity_log_type", table_name="student_activity_log")
    op.drop_index("ix_student_activity_log_student_id", table_name="student_activity_log")
    op.drop_index("ix_student_activity_log_id", table_name="student_activity_log")
    op.drop_table("student_activity_log")
