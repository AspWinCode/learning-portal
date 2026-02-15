"""Add lead statuses dictionary and link from leads

Revision ID: 0015_add_lead_status_options
Revises: 0014_add_communication_channel_to_leads
Create Date: 2026-02-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_add_lead_status_options"
down_revision = "0014_add_communication_channel_to_leads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_statuses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("base_status", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_lead_statuses_name", "lead_statuses", ["name"], unique=False)
    op.create_index("ix_lead_statuses_base_status", "lead_statuses", ["base_status"], unique=False)
    op.create_index("ix_lead_statuses_is_active", "lead_statuses", ["is_active"], unique=False)

    op.add_column("leads", sa.Column("status_option_id", sa.Integer(), nullable=True))
    op.create_index("ix_leads_status_option_id", "leads", ["status_option_id"], unique=False)
    op.create_foreign_key(
        "fk_leads_status_option_id_lead_statuses",
        "leads",
        "lead_statuses",
        ["status_option_id"],
        ["id"],
    )

    op.execute(
        """
        INSERT INTO lead_statuses (name, base_status, is_active)
        VALUES
          ('Новый', 'new', true),
          ('Связались', 'contacted', true),
          ('Демо', 'demo', true),
          ('Инвойс отправлен', 'invoice_sent', true),
          ('Успешно', 'won', true),
          ('Закрыт', 'lost', true)
        """
    )
    op.execute(
        """
        UPDATE leads l
        SET status_option_id = ls.id
        FROM lead_statuses ls
        WHERE ls.base_status = CAST(l.status AS TEXT)
          AND l.status_option_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_leads_status_option_id_lead_statuses", "leads", type_="foreignkey")
    op.drop_index("ix_leads_status_option_id", table_name="leads")
    op.drop_column("leads", "status_option_id")

    op.drop_index("ix_lead_statuses_is_active", table_name="lead_statuses")
    op.drop_index("ix_lead_statuses_base_status", table_name="lead_statuses")
    op.drop_index("ix_lead_statuses_name", table_name="lead_statuses")
    op.drop_table("lead_statuses")
