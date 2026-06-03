"""Add campaign_events and school_campaign_events (джемы внутри кампании и участие школ).

Revision ID: 0071_campaign_events
Revises: 0070_finance_account_nalichka
Create Date: 2026-03-08

"""

from alembic import op
import sqlalchemy as sa


revision = "0071_campaign_events"
down_revision = "0070_finance_account_nalichka"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": name},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "campaign_events"):
        op.create_table(
            "campaign_events",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("campaign_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("event_date", sa.Date(), nullable=False),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("location", sa.String(length=512), nullable=True),
            sa.Column("city", sa.String(length=256), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        )
        op.create_index(op.f("ix_campaign_events_campaign_id", if_not_exists=True), "campaign_events", ["campaign_id"], unique=False)
        op.create_index(op.f("ix_campaign_events_event_date", if_not_exists=True), "campaign_events", ["event_date"], unique=False)
        op.create_index("ix_campaign_events_campaign_date", "campaign_events", ["campaign_id", "event_date"], unique=False, if_not_exists=True)
        op.create_index(op.f("ix_campaign_events_status", if_not_exists=True), "campaign_events", ["status"], unique=False)

    if not _table_exists(conn, "school_campaign_events"):
        op.create_table(
            "school_campaign_events",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("campaign_event_id", sa.Integer(), nullable=False),
            sa.Column("school_campaign_id", sa.Integer(), nullable=False),
            sa.Column("invite_status", sa.String(length=32), nullable=False, server_default="not_invited"),
            sa.Column("participation_status", sa.String(length=32), nullable=False, server_default="not_planned"),
            sa.Column("participant_count", sa.Integer(), nullable=True),
            sa.Column("host_status", sa.String(length=32), nullable=False, server_default="not_host"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["campaign_event_id"], ["campaign_events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["school_campaign_id"], ["school_campaigns.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("campaign_event_id", "school_campaign_id", name="uq_school_campaign_event_event_school"),
        )
        op.create_index(op.f("ix_school_campaign_events_campaign_event_id", if_not_exists=True), "school_campaign_events", ["campaign_event_id"], unique=False)
        op.create_index(op.f("ix_school_campaign_events_school_campaign_id", if_not_exists=True), "school_campaign_events", ["school_campaign_id"], unique=False)
        op.create_index(op.f("ix_school_campaign_events_invite_status", if_not_exists=True), "school_campaign_events", ["invite_status"], unique=False)
        op.create_index(op.f("ix_school_campaign_events_participation_status", if_not_exists=True), "school_campaign_events", ["participation_status"], unique=False)
        op.create_index(op.f("ix_school_campaign_events_host_status", if_not_exists=True), "school_campaign_events", ["host_status"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "school_campaign_events"):
        op.drop_index(op.f("ix_school_campaign_events_host_status"), table_name="school_campaign_events")
        op.drop_index(op.f("ix_school_campaign_events_participation_status"), table_name="school_campaign_events")
        op.drop_index(op.f("ix_school_campaign_events_invite_status"), table_name="school_campaign_events")
        op.drop_index(op.f("ix_school_campaign_events_school_campaign_id"), table_name="school_campaign_events")
        op.drop_index(op.f("ix_school_campaign_events_campaign_event_id"), table_name="school_campaign_events")
        op.drop_table("school_campaign_events")
    if _table_exists(conn, "campaign_events"):
        op.drop_index(op.f("ix_campaign_events_status"), table_name="campaign_events")
        op.drop_index("ix_campaign_events_campaign_date", table_name="campaign_events")
        op.drop_index(op.f("ix_campaign_events_event_date"), table_name="campaign_events")
        op.drop_index(op.f("ix_campaign_events_campaign_id"), table_name="campaign_events")
        op.drop_table("campaign_events")
