"""0081: owner workspace task manager core entities

Revision ID: 0081
Revises: 0080
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_workspace_projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_project_id", sa.Integer(), sa.ForeignKey("owner_workspace_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_owner_workspace_projects_name", "owner_workspace_projects", ["name"])
    op.create_index("ix_owner_workspace_projects_status", "owner_workspace_projects", ["status"])
    op.create_index("ix_owner_workspace_projects_owner_id", "owner_workspace_projects", ["owner_id"])
    op.create_index("ix_owner_workspace_projects_parent_project_id", "owner_workspace_projects", ["parent_project_id"])

    op.create_table(
        "owner_workspace_project_participants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "user_id", name="uq_owner_workspace_project_participant"),
    )
    op.create_index("ix_owner_workspace_project_participants_project_id", "owner_workspace_project_participants", ["project_id"])
    op.create_index("ix_owner_workspace_project_participants_user_id", "owner_workspace_project_participants", ["user_id"])

    op.create_table(
        "owner_workspace_contacts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_owner_workspace_contacts_full_name", "owner_workspace_contacts", ["full_name"])
    op.create_index("ix_owner_workspace_contacts_phone", "owner_workspace_contacts", ["phone"])
    op.create_index("ix_owner_workspace_contacts_email", "owner_workspace_contacts", ["email"])
    op.create_index("ix_owner_workspace_contacts_company", "owner_workspace_contacts", ["company"])

    op.create_table(
        "owner_workspace_project_contacts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "contact_id", name="uq_owner_workspace_project_contact"),
    )
    op.create_index("ix_owner_workspace_project_contacts_project_id", "owner_workspace_project_contacts", ["project_id"])
    op.create_index("ix_owner_workspace_project_contacts_contact_id", "owner_workspace_project_contacts", ["contact_id"])

    op.create_table(
        "owner_workspace_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("owner_workspace_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("owner_workspace_contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("checklist", sa.JSON(), nullable=True),
        sa.Column("attachments", sa.JSON(), nullable=True),
        sa.Column("previous_task_id", sa.Integer(), sa.ForeignKey("owner_workspace_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_owner_workspace_tasks_title", "owner_workspace_tasks", ["title"])
    op.create_index("ix_owner_workspace_tasks_status", "owner_workspace_tasks", ["status"])
    op.create_index("ix_owner_workspace_tasks_priority", "owner_workspace_tasks", ["priority"])
    op.create_index("ix_owner_workspace_tasks_deadline_at", "owner_workspace_tasks", ["deadline_at"])
    op.create_index("ix_owner_workspace_tasks_completed_at", "owner_workspace_tasks", ["completed_at"])
    op.create_index("ix_owner_workspace_tasks_assignee_id", "owner_workspace_tasks", ["assignee_id"])
    op.create_index("ix_owner_workspace_tasks_creator_id", "owner_workspace_tasks", ["creator_id"])
    op.create_index("ix_owner_workspace_tasks_project_id", "owner_workspace_tasks", ["project_id"])
    op.create_index("ix_owner_workspace_tasks_contact_id", "owner_workspace_tasks", ["contact_id"])
    op.create_index("ix_owner_workspace_tasks_previous_task_id", "owner_workspace_tasks", ["previous_task_id"])

    op.create_table(
        "owner_workspace_task_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_owner_workspace_task_comments_task_id", "owner_workspace_task_comments", ["task_id"])
    op.create_index("ix_owner_workspace_task_comments_author_id", "owner_workspace_task_comments", ["author_id"])

    op.create_table(
        "owner_workspace_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("owner_workspace_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_chat_id", sa.String(length=128), nullable=True),
        sa.Column("external_message_id", sa.String(length=128), nullable=True),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="incoming"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("attachments", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_owner_workspace_messages_contact_id", "owner_workspace_messages", ["contact_id"])
    op.create_index("ix_owner_workspace_messages_external_chat_id", "owner_workspace_messages", ["external_chat_id"])
    op.create_index("ix_owner_workspace_messages_external_message_id", "owner_workspace_messages", ["external_message_id"])
    op.create_index("ix_owner_workspace_messages_direction", "owner_workspace_messages", ["direction"])
    op.create_index("ix_owner_workspace_messages_sent_at", "owner_workspace_messages", ["sent_at"])
    op.create_index("ix_owner_workspace_messages_received_at", "owner_workspace_messages", ["received_at"])
    op.create_index("ix_owner_workspace_messages_created_at", "owner_workspace_messages", ["created_at"])

    op.create_table(
        "owner_workspace_task_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("owner_workspace_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("owner_workspace_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "message_id", name="uq_owner_workspace_task_message"),
    )
    op.create_index("ix_owner_workspace_task_messages_task_id", "owner_workspace_task_messages", ["task_id"])
    op.create_index("ix_owner_workspace_task_messages_message_id", "owner_workspace_task_messages", ["message_id"])

    op.create_table(
        "owner_workspace_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.JSON(), nullable=True),
        sa.Column("new_value", sa.JSON(), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_owner_workspace_audit_logs_entity_type", "owner_workspace_audit_logs", ["entity_type"])
    op.create_index("ix_owner_workspace_audit_logs_entity_id", "owner_workspace_audit_logs", ["entity_id"])
    op.create_index("ix_owner_workspace_audit_logs_action_type", "owner_workspace_audit_logs", ["action_type"])
    op.create_index("ix_owner_workspace_audit_logs_author_id", "owner_workspace_audit_logs", ["author_id"])
    op.create_index("ix_owner_workspace_audit_logs_created_at", "owner_workspace_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_owner_workspace_audit_logs_created_at", "owner_workspace_audit_logs")
    op.drop_index("ix_owner_workspace_audit_logs_author_id", "owner_workspace_audit_logs")
    op.drop_index("ix_owner_workspace_audit_logs_action_type", "owner_workspace_audit_logs")
    op.drop_index("ix_owner_workspace_audit_logs_entity_id", "owner_workspace_audit_logs")
    op.drop_index("ix_owner_workspace_audit_logs_entity_type", "owner_workspace_audit_logs")
    op.drop_table("owner_workspace_audit_logs")

    op.drop_index("ix_owner_workspace_task_messages_message_id", "owner_workspace_task_messages")
    op.drop_index("ix_owner_workspace_task_messages_task_id", "owner_workspace_task_messages")
    op.drop_table("owner_workspace_task_messages")

    op.drop_index("ix_owner_workspace_messages_created_at", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_received_at", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_sent_at", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_direction", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_external_message_id", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_external_chat_id", "owner_workspace_messages")
    op.drop_index("ix_owner_workspace_messages_contact_id", "owner_workspace_messages")
    op.drop_table("owner_workspace_messages")

    op.drop_index("ix_owner_workspace_task_comments_author_id", "owner_workspace_task_comments")
    op.drop_index("ix_owner_workspace_task_comments_task_id", "owner_workspace_task_comments")
    op.drop_table("owner_workspace_task_comments")

    op.drop_index("ix_owner_workspace_tasks_previous_task_id", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_contact_id", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_project_id", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_creator_id", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_assignee_id", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_completed_at", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_deadline_at", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_priority", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_status", "owner_workspace_tasks")
    op.drop_index("ix_owner_workspace_tasks_title", "owner_workspace_tasks")
    op.drop_table("owner_workspace_tasks")

    op.drop_index("ix_owner_workspace_project_contacts_contact_id", "owner_workspace_project_contacts")
    op.drop_index("ix_owner_workspace_project_contacts_project_id", "owner_workspace_project_contacts")
    op.drop_table("owner_workspace_project_contacts")

    op.drop_index("ix_owner_workspace_contacts_company", "owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_email", "owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_phone", "owner_workspace_contacts")
    op.drop_index("ix_owner_workspace_contacts_full_name", "owner_workspace_contacts")
    op.drop_table("owner_workspace_contacts")

    op.drop_index("ix_owner_workspace_project_participants_user_id", "owner_workspace_project_participants")
    op.drop_index("ix_owner_workspace_project_participants_project_id", "owner_workspace_project_participants")
    op.drop_table("owner_workspace_project_participants")

    op.drop_index("ix_owner_workspace_projects_parent_project_id", "owner_workspace_projects")
    op.drop_index("ix_owner_workspace_projects_owner_id", "owner_workspace_projects")
    op.drop_index("ix_owner_workspace_projects_status", "owner_workspace_projects")
    op.drop_index("ix_owner_workspace_projects_name", "owner_workspace_projects")
    op.drop_table("owner_workspace_projects")
