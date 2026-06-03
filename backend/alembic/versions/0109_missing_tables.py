"""Add tables missing from migrations: b2b_school_contacts, group_schedules,
owner_funnel_events, owner_funnel_items

Revision ID: 0109_missing_tables
Revises: 0108_b2b_school_meeting_fields
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0109_missing_tables"
down_revision = "0108_b2b_school_meeting_fields"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"),
        {"t": name},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "group_schedules"):
        op.create_table(
            "group_schedules",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("day_of_week", sa.Integer(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_group_schedules_id", "group_schedules", ["id"], unique=False, if_not_exists=True)
        op.create_index("ix_group_schedules_group_id", "group_schedules", ["group_id"], unique=False, if_not_exists=True)

    if not _table_exists(conn, "b2b_school_contacts"):
        op.create_table(
            "b2b_school_contacts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("b2b_school_id", sa.Integer(), sa.ForeignKey("b2b_schools.id", ondelete="CASCADE"), nullable=False),
            sa.Column("full_name", sa.String(), nullable=False),
            sa.Column("position", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=False),
            sa.Column("phone_extra", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_b2b_school_contacts_id", "b2b_school_contacts", ["id"], unique=False, if_not_exists=True)
        op.create_index("ix_b2b_school_contacts_b2b_school_id", "b2b_school_contacts", ["b2b_school_id"], unique=False, if_not_exists=True)

    if not _table_exists(conn, "owner_funnel_events"):
        op.create_table(
            "owner_funnel_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("event_name", sa.String(512), nullable=False),
            sa.Column("event_dates", sa.String(256), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(conn, "owner_funnel_items"):
        op.create_table(
            "owner_funnel_items",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("funnel_type", sa.String(64), nullable=False),
            sa.Column("event_id", sa.Integer(), sa.ForeignKey("owner_funnel_events.id", ondelete="CASCADE"), nullable=True),
            sa.Column("stage", sa.String(64), nullable=False),
            sa.Column("title", sa.String(512), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("card_data", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_owner_funnel_items_id", "owner_funnel_items", ["id"], unique=False, if_not_exists=True)
        op.create_index("ix_owner_funnel_items_funnel_type", "owner_funnel_items", ["funnel_type"], unique=False, if_not_exists=True)
        op.create_index("ix_owner_funnel_items_event_id", "owner_funnel_items", ["event_id"], unique=False, if_not_exists=True)
        op.create_index("ix_owner_funnel_items_stage", "owner_funnel_items", ["stage"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_table("owner_funnel_items")
    op.drop_table("owner_funnel_events")
    op.drop_table("b2b_school_contacts")
    op.drop_table("group_schedules")
