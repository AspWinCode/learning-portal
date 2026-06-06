"""owner workspace meetings

Revision ID: 0119_owner_workspace_meetings
Revises: 0118_task_reminder
Create Date: 2026-06-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0119_owner_workspace_meetings"
down_revision = "0118_task_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_meetings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("agenda", sa.Text(), nullable=True),
        sa.Column("meeting_result", sa.Text(), nullable=True),
        sa.Column("next_steps", sa.Text(), nullable=True),
        sa.Column("meeting_date", sa.Date(), nullable=False),
        sa.Column("meeting_time", sa.Time(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="planned", nullable=False),
        sa.Column("responsible_user_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("meeting_type", sa.String(length=32), server_default="online", nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("online_url", sa.String(length=512), nullable=True),
        sa.Column("recurrence_type", sa.String(length=32), server_default="none", nullable=False),
        sa.Column("reminder_type", sa.String(length=32), nullable=True),
        sa.Column("previous_meeting_id", sa.Integer(), nullable=True),
        sa.Column("next_meeting_id", sa.Integer(), nullable=True),
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["next_meeting_id"], ["owner_workspace_meetings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["previous_meeting_id"], ["owner_workspace_meetings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["owner_workspace_projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["responsible_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_owner_workspace_meetings_id"), "owner_workspace_meetings", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_title"), "owner_workspace_meetings", ["title"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_status"), "owner_workspace_meetings", ["status"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_meeting_date"), "owner_workspace_meetings", ["meeting_date"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_meeting_type"), "owner_workspace_meetings", ["meeting_type"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_project_id"), "owner_workspace_meetings", ["project_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_responsible_user_id"), "owner_workspace_meetings", ["responsible_user_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_created_by"), "owner_workspace_meetings", ["created_by"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_created_at"), "owner_workspace_meetings", ["created_at"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_previous_meeting_id"), "owner_workspace_meetings", ["previous_meeting_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meetings_next_meeting_id"), "owner_workspace_meetings", ["next_meeting_id"], unique=False)

    op.create_table(
        "owner_workspace_meeting_contacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["contact_id"], ["owner_workspace_contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meeting_id"], ["owner_workspace_meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "contact_id", name="uq_owner_workspace_meeting_contact"),
    )
    op.create_index(op.f("ix_owner_workspace_meeting_contacts_id"), "owner_workspace_meeting_contacts", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_contacts_meeting_id"), "owner_workspace_meeting_contacts", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_contacts_contact_id"), "owner_workspace_meeting_contacts", ["contact_id"], unique=False)

    op.create_table(
        "owner_workspace_meeting_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["meeting_id"], ["owner_workspace_meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "user_id", name="uq_owner_workspace_meeting_user"),
    )
    op.create_index(op.f("ix_owner_workspace_meeting_users_id"), "owner_workspace_meeting_users", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_users_meeting_id"), "owner_workspace_meeting_users", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_users_user_id"), "owner_workspace_meeting_users", ["user_id"], unique=False)

    op.create_table(
        "owner_workspace_meeting_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["meeting_id"], ["owner_workspace_meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["owner_workspace_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "task_id", name="uq_owner_workspace_meeting_task"),
    )
    op.create_index(op.f("ix_owner_workspace_meeting_tasks_id"), "owner_workspace_meeting_tasks", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_tasks_meeting_id"), "owner_workspace_meeting_tasks", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_tasks_task_id"), "owner_workspace_meeting_tasks", ["task_id"], unique=False)

    op.create_table(
        "owner_workspace_meeting_reschedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("old_date", sa.Date(), nullable=False),
        sa.Column("old_time", sa.Time(), nullable=False),
        sa.Column("new_date", sa.Date(), nullable=False),
        sa.Column("new_time", sa.Time(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["meeting_id"], ["owner_workspace_meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_owner_workspace_meeting_reschedules_id"), "owner_workspace_meeting_reschedules", ["id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_reschedules_meeting_id"), "owner_workspace_meeting_reschedules", ["meeting_id"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_reschedules_changed_by"), "owner_workspace_meeting_reschedules", ["changed_by"], unique=False)
    op.create_index(op.f("ix_owner_workspace_meeting_reschedules_created_at"), "owner_workspace_meeting_reschedules", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_table("owner_workspace_meeting_reschedules")
    op.drop_table("owner_workspace_meeting_tasks")
    op.drop_table("owner_workspace_meeting_users")
    op.drop_table("owner_workspace_meeting_contacts")
    op.drop_table("owner_workspace_meetings")
