"""Lead pipeline rework: new statuses (messaged, later), arrival_channel,
scheduled_event_type, thinking_reason, campaign_event_id.

Revision ID: 0199
Revises: 0198
Create Date: 2026-09-24

Adds two new LeadStatus enum values used by the reworked kanban funnel
("Написали в мессенджер" / "Возможно позже сами выйдут на связь"), plus
new Lead columns needed for stage semantics (arrival channel, scheduled
event type, thinking reason, optional Game Jam campaign_event link).

Existing Lead.source / lost_reason / status values are left untouched;
arrival_channel is backfilled conservatively from existing signals.
"""
from alembic import op
import sqlalchemy as sa


revision = "0199"
down_revision = "0198"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE must run outside the current transaction in PostgreSQL.
    conn = op.get_bind()
    conn.execute(sa.text("COMMIT"))
    conn.execute(sa.text("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'messaged'"))
    conn.execute(sa.text("ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS 'later'"))

    op.add_column("leads", sa.Column("arrival_channel", sa.String(length=32), nullable=True))
    op.add_column("leads", sa.Column("scheduled_event_type", sa.String(length=32), nullable=True))
    op.add_column("leads", sa.Column("thinking_reason", sa.String(length=32), nullable=True))
    op.add_column("leads", sa.Column("campaign_event_id", sa.Integer(), nullable=True))
    op.create_index("ix_leads_arrival_channel", "leads", ["arrival_channel"])
    op.create_index("ix_leads_campaign_event_id", "leads", ["campaign_event_id"])
    op.create_foreign_key(
        "fk_leads_campaign_event_id",
        "leads",
        "campaign_events",
        ["campaign_event_id"],
        ["id"],
    )

    # Conservative backfill: only classify what we can infer with confidence,
    # leave the rest as NULL (frontend treats missing arrival_channel as
    # "other") rather than guessing.
    op.execute(
        "UPDATE leads SET arrival_channel = 'questionnaire' "
        "WHERE questionnaire_filled IS TRUE AND arrival_channel IS NULL"
    )
    op.execute(
        "UPDATE leads SET arrival_channel = 'site' "
        "WHERE arrival_channel IS NULL AND ("
        "source ILIKE '%тильда%' OR source ILIKE '%tilda%'"
        ")"
    )


def downgrade() -> None:
    op.drop_constraint("fk_leads_campaign_event_id", "leads", type_="foreignkey")
    op.drop_index("ix_leads_campaign_event_id", table_name="leads")
    op.drop_index("ix_leads_arrival_channel", table_name="leads")
    op.drop_column("leads", "campaign_event_id")
    op.drop_column("leads", "thinking_reason")
    op.drop_column("leads", "scheduled_event_type")
    op.drop_column("leads", "arrival_channel")

    # Enum values cannot be dropped in PostgreSQL without recreating the type.
    # Migrate affected rows to a safe default so a manual type rebuild is possible.
    op.execute("UPDATE leads SET status = 'new' WHERE status = 'messaged'")
    op.execute("UPDATE leads SET status = 'thinking' WHERE status = 'later'")
