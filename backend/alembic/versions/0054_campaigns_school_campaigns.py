"""Add campaigns and school_campaigns (кампании и участие школ в кампаниях).

Revision ID: 0054_campaigns_school_campaigns
Revises: 0053_account_templates
Create Date: 2026-02-27

Таблицы только добавляются, существующие не изменяются.
"""

from alembic import op
import sqlalchemy as sa


revision = "0054_campaigns_school_campaigns"
down_revision = "0053_account_templates"
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
    if not _table_exists(conn, "campaigns"):
        op.create_table(
            "campaigns",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=512), nullable=False),
            sa.Column("type", sa.String(length=32), nullable=False),
            sa.Column("format", sa.String(length=32), nullable=False),
            sa.Column("city", sa.String(length=256), nullable=True),
            sa.Column("region", sa.String(length=256), nullable=True),
            sa.Column("date_from", sa.Date(), nullable=True),
            sa.Column("date_to", sa.Date(), nullable=True),
            sa.Column("responsible_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
            sa.Column("mode", sa.String(length=32), nullable=False, server_default="city"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["responsible_id"], ["users.id"], ondelete="SET NULL"),
        )
        op.create_index(op.f("ix_campaigns_city"), "campaigns", ["city"], unique=False)
        op.create_index(op.f("ix_campaigns_status"), "campaigns", ["status"], unique=False)
        op.create_index(op.f("ix_campaigns_type"), "campaigns", ["type"], unique=False)

    if not _table_exists(conn, "school_campaigns"):
        op.create_table(
            "school_campaigns",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("b2b_school_id", sa.Integer(), nullable=False),
            sa.Column("campaign_id", sa.Integer(), nullable=False),
            sa.Column("stage", sa.String(length=64), nullable=False, server_default="not_contacted"),
            sa.Column("support_letter_status", sa.String(length=32), nullable=True),
            sa.Column("thank_you_sent", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["b2b_school_id"], ["b2b_schools.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("b2b_school_id", "campaign_id", name="uq_school_campaigns_school_campaign"),
        )
        op.create_index(op.f("ix_school_campaigns_b2b_school_id"), "school_campaigns", ["b2b_school_id"], unique=False)
        op.create_index(op.f("ix_school_campaigns_campaign_id"), "school_campaigns", ["campaign_id"], unique=False)
        op.create_index(op.f("ix_school_campaigns_stage"), "school_campaigns", ["stage"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "school_campaigns"):
        op.drop_index(op.f("ix_school_campaigns_stage"), table_name="school_campaigns")
        op.drop_index(op.f("ix_school_campaigns_campaign_id"), table_name="school_campaigns")
        op.drop_index(op.f("ix_school_campaigns_b2b_school_id"), table_name="school_campaigns")
        op.drop_table("school_campaigns")
    if _table_exists(conn, "campaigns"):
        op.drop_index(op.f("ix_campaigns_type"), table_name="campaigns")
        op.drop_index(op.f("ix_campaigns_status"), table_name="campaigns")
        op.drop_index(op.f("ix_campaigns_city"), table_name="campaigns")
        op.drop_table("campaigns")
