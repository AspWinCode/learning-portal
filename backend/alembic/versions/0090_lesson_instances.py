"""0090: add lesson_instances, lesson_instance_students, lesson_audit_logs

Revision ID: 0090_lesson_instances
Revises: 0089_owner_workspace_web_push_outbox
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0090_lesson_instances"
down_revision = "0089_owner_workspace_web_push_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- lesson_instances ---
    has_table = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name='lesson_instances'"
    )).fetchone()
    if not has_table:
        op.create_table(
            "lesson_instances",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("group_id", sa.Integer, sa.ForeignKey("groups.id"), nullable=True, index=True),
            sa.Column("schedule_id", sa.Integer, sa.ForeignKey("group_schedules.id"), nullable=True, index=True),
            sa.Column("lesson_date", sa.Date, nullable=False, index=True),
            sa.Column("start_time", sa.Time, nullable=False),
            sa.Column("end_time", sa.Time, nullable=True),
            sa.Column("trainer_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True, index=True),
            sa.Column("title", sa.String(256), nullable=True),
            sa.Column("program_id", sa.Integer, sa.ForeignKey("programs.id"), nullable=True, index=True),
            sa.Column("lesson_type", sa.String(32), nullable=False, server_default="group"),
            sa.Column("status", sa.String(32), nullable=False, server_default="planned"),
            sa.Column("comment", sa.Text, nullable=True),
            sa.Column("source_type", sa.String(32), nullable=True),
            sa.Column("moved_from_id", sa.Integer, sa.ForeignKey("lesson_instances.id"), nullable=True, index=True),
            sa.Column("moved_to_id", sa.Integer, sa.ForeignKey("lesson_instances.id"), nullable=True),
            sa.Column("cancel_reason", sa.String(256), nullable=True),
            sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True, index=True),
            sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        )
        op.create_index("ix_lesson_instances_lesson_date", "lesson_instances", ["lesson_date"])
        op.create_index("ix_lesson_instances_group_id", "lesson_instances", ["group_id"])
        op.create_index("ix_lesson_instances_trainer_id", "lesson_instances", ["trainer_id"])
        op.create_index("ix_lesson_instances_status", "lesson_instances", ["status"])
        op.create_index("ix_lesson_instances_lesson_type", "lesson_instances", ["lesson_type"])
        op.create_index(
            "ix_lesson_instances_group_date",
            "lesson_instances",
            ["group_id", "lesson_date"],
        )

    # --- lesson_instance_students ---
    has_table2 = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name='lesson_instance_students'"
    )).fetchone()
    if not has_table2:
        op.create_table(
            "lesson_instance_students",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column(
                "lesson_instance_id",
                sa.Integer,
                sa.ForeignKey("lesson_instances.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("student_id", sa.Integer, sa.ForeignKey("students.id"), nullable=False, index=True),
            sa.Column("participation_status", sa.String(32), nullable=False, server_default="planned"),
            sa.Column("attended", sa.Boolean, nullable=True),
            sa.Column("late", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("absence_reason", sa.String(64), nullable=True),
            sa.Column("absence_comment", sa.Text, nullable=True),
            sa.Column(
                "planned_absence_id",
                sa.Integer,
                sa.ForeignKey("absence_follow_ups.id"),
                nullable=True,
                index=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.UniqueConstraint("lesson_instance_id", "student_id", name="uq_lesson_instance_student"),
        )

    # --- lesson_audit_logs ---
    has_table3 = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name='lesson_audit_logs'"
    )).fetchone()
    if not has_table3:
        op.create_table(
            "lesson_audit_logs",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column(
                "lesson_instance_id",
                sa.Integer,
                sa.ForeignKey("lesson_instances.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("entity_type", sa.String(64), nullable=False),
            sa.Column("entity_id", sa.Integer, nullable=True),
            sa.Column("field_name", sa.String(128), nullable=True),
            sa.Column("old_value", sa.Text, nullable=True),
            sa.Column("new_value", sa.Text, nullable=True),
            sa.Column("action", sa.String(64), nullable=False, index=True),
            sa.Column("changed_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True, index=True),
            sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )


def downgrade() -> None:
    op.drop_table("lesson_audit_logs")
    op.drop_table("lesson_instance_students")
    op.drop_index("ix_lesson_instances_group_date", table_name="lesson_instances")
    op.drop_index("ix_lesson_instances_lesson_type", table_name="lesson_instances")
    op.drop_index("ix_lesson_instances_status", table_name="lesson_instances")
    op.drop_index("ix_lesson_instances_trainer_id", table_name="lesson_instances")
    op.drop_index("ix_lesson_instances_group_id", table_name="lesson_instances")
    op.drop_index("ix_lesson_instances_lesson_date", table_name="lesson_instances")
    op.drop_table("lesson_instances")
