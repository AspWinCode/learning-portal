"""Task manager: task_templates, tasks, subtasks, task_students

Revision ID: 0014_task_manager
Revises: 0013_student_program_link_status
Create Date: 2026-02-18

"""
from alembic import op
import sqlalchemy as sa


revision = "0014_task_manager"
down_revision = "0013_student_program_link_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "task_template_subtasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("task_templates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("text", sa.String(1024), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "task_template_students",
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("task_templates.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("task_templates.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("assigned_to_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_table(
        "task_subtasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("text", sa.String(1024), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "task_students",
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("task_students")
    op.drop_table("task_subtasks")
    op.drop_table("tasks")
    op.drop_table("task_template_students")
    op.drop_table("task_template_subtasks")
    op.drop_table("task_templates")
