"""Add events and event registrations

Revision ID: 0008_add_events_and_registrations
Revises: 0007_add_sales_role_and_leads
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_add_events_and_registrations"
down_revision = "0007_add_sales_role_and_leads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eventstatus') THEN
                CREATE TYPE eventstatus AS ENUM ('active', 'archived');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eventregistrationstatus') THEN
                CREATE TYPE eventregistrationstatus AS ENUM ('registered', 'cancelled');
            END IF;
        END $$;
        """
    )

    event_status_enum = postgresql.ENUM("active", "archived", name="eventstatus", create_type=False)
    reg_status_enum = postgresql.ENUM("registered", "cancelled", name="eventregistrationstatus", create_type=False)

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("status", event_status_enum, nullable=False, server_default="active"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_events_starts_at", "events", ["starts_at"])
    op.create_index("ix_events_status", "events", ["status"])
    op.create_index("ix_events_created_by", "events", ["created_by"])

    op.create_table(
        "event_registrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("events.id"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", reg_status_enum, nullable=False, server_default="registered"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("event_id", "lead_id", name="uq_event_lead_registration"),
    )
    op.create_index("ix_event_registrations_event_id", "event_registrations", ["event_id"])
    op.create_index("ix_event_registrations_lead_id", "event_registrations", ["lead_id"])
    op.create_index("ix_event_registrations_owner_id", "event_registrations", ["owner_id"])
    op.create_index("ix_event_registrations_status", "event_registrations", ["status"])


def downgrade() -> None:
    op.drop_index("ix_event_registrations_status", table_name="event_registrations")
    op.drop_index("ix_event_registrations_owner_id", table_name="event_registrations")
    op.drop_index("ix_event_registrations_lead_id", table_name="event_registrations")
    op.drop_index("ix_event_registrations_event_id", table_name="event_registrations")
    op.drop_table("event_registrations")

    op.drop_index("ix_events_created_by", table_name="events")
    op.drop_index("ix_events_status", table_name="events")
    op.drop_index("ix_events_starts_at", table_name="events")
    op.drop_table("events")
