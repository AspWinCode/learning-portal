"""Split contacts into contacts (simple) and counterparties (business entities)

Revision ID: 0112_split_contacts_counterparties
Revises: 0111_counterparty_linked_persons
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0112_split_contacts_counterparties"
down_revision = "0111_counterparty_linked_persons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. Create owner_workspace_counterparties table
    # -----------------------------------------------------------------------
    op.create_table(
        "owner_workspace_counterparties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type", sa.String(32), nullable=False, server_default="company"),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("position", sa.String(255), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("source", sa.String(128), nullable=True),
        sa.Column("custom_fields", sa.JSON(), nullable=True),
        sa.Column("linked_persons", sa.JSON(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_owner_workspace_counterparties_full_name", "owner_workspace_counterparties", ["full_name"])
    op.create_index("ix_owner_workspace_counterparties_phone", "owner_workspace_counterparties", ["phone"])
    op.create_index("ix_owner_workspace_counterparties_email", "owner_workspace_counterparties", ["email"])
    op.create_index("ix_owner_workspace_counterparties_company", "owner_workspace_counterparties", ["company"])
    op.create_index("ix_owner_workspace_counterparties_is_archived", "owner_workspace_counterparties", ["is_archived"])
    op.create_index("ix_owner_workspace_counterparties_archived_at", "owner_workspace_counterparties", ["archived_at"])

    # -----------------------------------------------------------------------
    # 2. Copy all existing contacts → counterparties (preserve IDs)
    # -----------------------------------------------------------------------
    op.execute(
        "INSERT INTO owner_workspace_counterparties "
        "(id, type, full_name, phone, email, company, position, tags, comment, source, "
        "custom_fields, linked_persons, is_archived, archived_at, created_at, updated_at) "
        "SELECT id, type, full_name, phone, email, company, position, tags, comment, source, "
        "custom_fields, linked_persons, is_archived, archived_at, created_at, updated_at "
        "FROM owner_workspace_contacts"
    )
    # Sync sequence so new counterparties get IDs after the migrated ones
    op.execute(
        "SELECT setval('owner_workspace_counterparties_id_seq', "
        "GREATEST(1, COALESCE((SELECT MAX(id) FROM owner_workspace_counterparties), 0)))"
    )

    # -----------------------------------------------------------------------
    # 3. Create project_counterparties junction table (replaces project_contacts for counterparties)
    # -----------------------------------------------------------------------
    op.create_table(
        "owner_workspace_project_counterparties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "counterparty_id",
            sa.Integer(),
            sa.ForeignKey("owner_workspace_counterparties.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "counterparty_id", name="uq_owner_workspace_project_counterparty"),
    )

    # 4. Migrate project_contacts → project_counterparties
    op.execute(
        "INSERT INTO owner_workspace_project_counterparties (project_id, counterparty_id, created_at) "
        "SELECT project_id, contact_id, created_at FROM owner_workspace_project_contacts "
        "ON CONFLICT DO NOTHING"
    )

    # 5. Clear project_contacts (now dedicated to simple contacts only)
    op.execute("TRUNCATE owner_workspace_project_contacts")

    # -----------------------------------------------------------------------
    # 6. Update projects.counterparty_id FK → counterparties
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE owner_workspace_projects "
        "DROP CONSTRAINT IF EXISTS owner_workspace_projects_counterparty_id_fkey"
    )
    op.create_foreign_key(
        "owner_workspace_projects_counterparty_id_fkey",
        "owner_workspace_projects", "owner_workspace_counterparties",
        ["counterparty_id"], ["id"],
        ondelete="SET NULL",
    )

    # -----------------------------------------------------------------------
    # 7. counterparty_documents: rename contact_id → counterparty_id, update FK
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE owner_workspace_counterparty_documents "
        "DROP CONSTRAINT IF EXISTS uq_owner_workspace_counterparty_document_contact_category"
    )
    op.execute(
        "ALTER TABLE owner_workspace_counterparty_documents "
        "DROP CONSTRAINT IF EXISTS owner_workspace_counterparty_documents_contact_id_fkey"
    )
    op.alter_column("owner_workspace_counterparty_documents", "contact_id", new_column_name="counterparty_id")
    op.create_foreign_key(
        "owner_workspace_counterparty_documents_counterparty_id_fkey",
        "owner_workspace_counterparty_documents", "owner_workspace_counterparties",
        ["counterparty_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_owner_workspace_counterparty_document_counterparty_category",
        "owner_workspace_counterparty_documents",
        ["counterparty_id", "category"],
    )

    # -----------------------------------------------------------------------
    # 8. tasks: add counterparty_id, migrate contact_id values → counterparty_id
    # -----------------------------------------------------------------------
    op.add_column(
        "owner_workspace_tasks",
        sa.Column("counterparty_id", sa.Integer(), nullable=True, index=True),
    )
    op.execute(
        "UPDATE owner_workspace_tasks SET counterparty_id = contact_id WHERE contact_id IS NOT NULL"
    )
    op.execute("UPDATE owner_workspace_tasks SET contact_id = NULL")
    op.create_foreign_key(
        "owner_workspace_tasks_counterparty_id_fkey",
        "owner_workspace_tasks", "owner_workspace_counterparties",
        ["counterparty_id"], ["id"],
        ondelete="SET NULL",
    )
    # contact_id FK stays pointing to owner_workspace_contacts (for future simple-contact tasks)

    # -----------------------------------------------------------------------
    # 9. messages.contact_id FK → counterparties
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE owner_workspace_messages "
        "DROP CONSTRAINT IF EXISTS owner_workspace_messages_contact_id_fkey"
    )
    op.create_foreign_key(
        "owner_workspace_messages_contact_id_fkey",
        "owner_workspace_messages", "owner_workspace_counterparties",
        ["contact_id"], ["id"],
        ondelete="CASCADE",
    )

    # -----------------------------------------------------------------------
    # 10. notifications.contact_id FK → counterparties
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE owner_workspace_notifications "
        "DROP CONSTRAINT IF EXISTS owner_workspace_notifications_contact_id_fkey"
    )
    op.create_foreign_key(
        "owner_workspace_notifications_contact_id_fkey",
        "owner_workspace_notifications", "owner_workspace_counterparties",
        ["contact_id"], ["id"],
        ondelete="CASCADE",
    )

    # -----------------------------------------------------------------------
    # 11. conversation_reads.contact_id FK → counterparties
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE owner_workspace_conversation_reads "
        "DROP CONSTRAINT IF EXISTS owner_workspace_conversation_reads_contact_id_fkey"
    )
    op.create_foreign_key(
        "owner_workspace_conversation_reads_contact_id_fkey",
        "owner_workspace_conversation_reads", "owner_workspace_counterparties",
        ["contact_id"], ["id"],
        ondelete="CASCADE",
    )

    # -----------------------------------------------------------------------
    # 12. Clear contacts table — all historical data is now in counterparties.
    #     Simple contacts will be created fresh going forward.
    # -----------------------------------------------------------------------
    op.execute("DELETE FROM owner_workspace_contacts")
    op.execute("ALTER SEQUENCE owner_workspace_contacts_id_seq RESTART WITH 1")


def downgrade() -> None:
    # Reverse the migration (best-effort — data loss on counterparties created after upgrade)

    # Restore messages/notifications/conversation_reads FKs → contacts
    op.execute("ALTER TABLE owner_workspace_conversation_reads DROP CONSTRAINT IF EXISTS owner_workspace_conversation_reads_contact_id_fkey")
    op.create_foreign_key("owner_workspace_conversation_reads_contact_id_fkey", "owner_workspace_conversation_reads", "owner_workspace_contacts", ["contact_id"], ["id"], ondelete="CASCADE")

    op.execute("ALTER TABLE owner_workspace_notifications DROP CONSTRAINT IF EXISTS owner_workspace_notifications_contact_id_fkey")
    op.create_foreign_key("owner_workspace_notifications_contact_id_fkey", "owner_workspace_notifications", "owner_workspace_contacts", ["contact_id"], ["id"], ondelete="CASCADE")

    op.execute("ALTER TABLE owner_workspace_messages DROP CONSTRAINT IF EXISTS owner_workspace_messages_contact_id_fkey")
    op.create_foreign_key("owner_workspace_messages_contact_id_fkey", "owner_workspace_messages", "owner_workspace_contacts", ["contact_id"], ["id"], ondelete="CASCADE")

    # Restore tasks
    op.execute("ALTER TABLE owner_workspace_tasks DROP CONSTRAINT IF EXISTS owner_workspace_tasks_counterparty_id_fkey")
    op.execute("UPDATE owner_workspace_tasks SET contact_id = counterparty_id WHERE counterparty_id IS NOT NULL")
    op.drop_column("owner_workspace_tasks", "counterparty_id")

    # Restore counterparty_documents
    op.execute("ALTER TABLE owner_workspace_counterparty_documents DROP CONSTRAINT IF EXISTS owner_workspace_counterparty_documents_counterparty_id_fkey")
    op.execute("ALTER TABLE owner_workspace_counterparty_documents DROP CONSTRAINT IF EXISTS uq_owner_workspace_counterparty_document_counterparty_category")
    op.alter_column("owner_workspace_counterparty_documents", "counterparty_id", new_column_name="contact_id")
    op.create_foreign_key("owner_workspace_counterparty_documents_contact_id_fkey", "owner_workspace_counterparty_documents", "owner_workspace_contacts", ["contact_id"], ["id"], ondelete="CASCADE")
    op.create_unique_constraint("uq_owner_workspace_counterparty_document_contact_category", "owner_workspace_counterparty_documents", ["contact_id", "category"])

    # Restore projects FK
    op.execute("ALTER TABLE owner_workspace_projects DROP CONSTRAINT IF EXISTS owner_workspace_projects_counterparty_id_fkey")
    op.create_foreign_key("owner_workspace_projects_counterparty_id_fkey", "owner_workspace_projects", "owner_workspace_contacts", ["counterparty_id"], ["id"], ondelete="SET NULL")

    # Restore project_contacts from project_counterparties
    op.execute("INSERT INTO owner_workspace_project_contacts (project_id, contact_id, created_at) SELECT project_id, counterparty_id, created_at FROM owner_workspace_project_counterparties ON CONFLICT DO NOTHING")

    # Restore contacts from counterparties
    op.execute(
        "INSERT INTO owner_workspace_contacts "
        "(id, type, full_name, phone, email, company, position, tags, comment, source, "
        "custom_fields, linked_persons, is_archived, archived_at, created_at, updated_at) "
        "SELECT id, type, full_name, phone, email, company, position, tags, comment, source, "
        "custom_fields, linked_persons, is_archived, archived_at, created_at, updated_at "
        "FROM owner_workspace_counterparties ON CONFLICT DO NOTHING"
    )

    op.drop_table("owner_workspace_project_counterparties")
    op.drop_table("owner_workspace_counterparties")
