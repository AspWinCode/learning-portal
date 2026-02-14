"""Add sales role and sales domain tables

Revision ID: 0007_add_sales_role_and_leads
Revises: 0006_add_trainer_comp_fields
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_add_sales_role_and_leads"
down_revision = "0006_add_trainer_comp_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend userrole enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'sales'")

    # Create enum types for sales domain
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leadstatus') THEN
                CREATE TYPE leadstatus AS ENUM ('new', 'contacted', 'demo', 'invoice_sent', 'won', 'lost');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leadtaskstatus') THEN
                CREATE TYPE leadtaskstatus AS ENUM ('open', 'done');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoicestatus') THEN
                CREATE TYPE invoicestatus AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
            END IF;
        END $$;
        """
    )

    lead_status_enum = postgresql.ENUM(
        "new", "contacted", "demo", "invoice_sent", "won", "lost", name="leadstatus", create_type=False
    )
    lead_task_status_enum = postgresql.ENUM("open", "done", name="leadtaskstatus", create_type=False)
    invoice_status_enum = postgresql.ENUM("draft", "sent", "paid", "overdue", "cancelled", name="invoicestatus", create_type=False)

    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("contact_name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("status", lead_status_enum, nullable=False, server_default="new", index=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("abonement_id", sa.Integer(), sa.ForeignKey("abonements.id"), nullable=True),
        sa.Column("desired_slot", sa.String(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("next_contact_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("lost_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "lead_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False, index=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("status", lead_task_status_enum, nullable=False, server_default="open", index=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False, index=True),
        sa.Column("abonement_id", sa.Integer(), sa.ForeignKey("abonements.id"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="RUB"),
        sa.Column("status", invoice_status_enum, nullable=False, server_default="draft", index=True),
        sa.Column("email_to", sa.String(), nullable=True),
        sa.Column("link", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("lead_tasks")
    op.drop_table("leads")
    # Enum removals are omitted (PostgreSQL limitation)
