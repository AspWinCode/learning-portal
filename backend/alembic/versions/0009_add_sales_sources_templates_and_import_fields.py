"""Add sales sources/templates/statuses and lead import fields

Revision ID: 0009_add_sales_sources_templates_and_import_fields
Revises: 0008_add_events_and_registrations
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_add_sales_sources_templates_and_import_fields"
down_revision = "0008_add_events_and_registrations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_lead_sources_name", "lead_sources", ["name"], unique=True, if_not_exists=True)
    op.create_index("ix_lead_sources_is_active", "lead_sources", ["is_active"], unique=False, if_not_exists=True)

    op.create_table(
        "lead_task_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_lead_task_templates_name", "lead_task_templates", ["name"], unique=True, if_not_exists=True)
    op.create_index("ix_lead_task_templates_is_active", "lead_task_templates", ["is_active"], unique=False, if_not_exists=True)

    op.create_table(
        "lead_task_statuses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_lead_task_statuses_name", "lead_task_statuses", ["name"], unique=True, if_not_exists=True)
    op.create_index("ix_lead_task_statuses_is_closed", "lead_task_statuses", ["is_closed"], unique=False, if_not_exists=True)
    op.create_index("ix_lead_task_statuses_is_active", "lead_task_statuses", ["is_active"], unique=False, if_not_exists=True)

    op.add_column("leads", sa.Column("parent_full_name", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("child_full_name", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("parent_phone", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("child_phone", sa.String(), nullable=True))
    op.add_column("leads", sa.Column("source_id", sa.Integer(), nullable=True))
    op.add_column("leads", sa.Column("referral_name", sa.String(), nullable=True))
    op.create_index("ix_leads_source_id", "leads", ["source_id"], unique=False, if_not_exists=True)
    op.create_foreign_key("fk_leads_source_id", "leads", "lead_sources", ["source_id"], ["id"])

    op.add_column("lead_tasks", sa.Column("template_id", sa.Integer(), nullable=True))
    op.add_column("lead_tasks", sa.Column("status_option_id", sa.Integer(), nullable=True))
    op.create_index("ix_lead_tasks_template_id", "lead_tasks", ["template_id"], unique=False, if_not_exists=True)
    op.create_index("ix_lead_tasks_status_option_id", "lead_tasks", ["status_option_id"], unique=False, if_not_exists=True)
    op.create_foreign_key("fk_lead_tasks_template_id", "lead_tasks", "lead_task_templates", ["template_id"], ["id"])
    op.create_foreign_key("fk_lead_tasks_status_option_id", "lead_tasks", "lead_task_statuses", ["status_option_id"], ["id"])

    op.execute(
        """
        INSERT INTO lead_sources (name, is_active)
        VALUES
            ('Поход по школам', true),
            ('2гис', true),
            ('сайт', true),
            ('рекомендация', true)
        ON CONFLICT (name) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO lead_task_statuses (name, is_closed, is_active)
        VALUES
            ('Открыта', false, true),
            ('В работе', false, true),
            ('Выполнена', true, true)
        ON CONFLICT (name) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_lead_tasks_status_option_id", "lead_tasks", type_="foreignkey")
    op.drop_constraint("fk_lead_tasks_template_id", "lead_tasks", type_="foreignkey")
    op.drop_index("ix_lead_tasks_status_option_id", table_name="lead_tasks")
    op.drop_index("ix_lead_tasks_template_id", table_name="lead_tasks")
    op.drop_column("lead_tasks", "status_option_id")
    op.drop_column("lead_tasks", "template_id")

    op.drop_constraint("fk_leads_source_id", "leads", type_="foreignkey")
    op.drop_index("ix_leads_source_id", table_name="leads")
    op.drop_column("leads", "referral_name")
    op.drop_column("leads", "source_id")
    op.drop_column("leads", "child_phone")
    op.drop_column("leads", "parent_phone")
    op.drop_column("leads", "child_full_name")
    op.drop_column("leads", "parent_full_name")

    op.drop_index("ix_lead_task_statuses_is_active", table_name="lead_task_statuses")
    op.drop_index("ix_lead_task_statuses_is_closed", table_name="lead_task_statuses")
    op.drop_index("ix_lead_task_statuses_name", table_name="lead_task_statuses")
    op.drop_table("lead_task_statuses")

    op.drop_index("ix_lead_task_templates_is_active", table_name="lead_task_templates")
    op.drop_index("ix_lead_task_templates_name", table_name="lead_task_templates")
    op.drop_table("lead_task_templates")

    op.drop_index("ix_lead_sources_is_active", table_name="lead_sources")
    op.drop_index("ix_lead_sources_name", table_name="lead_sources")
    op.drop_table("lead_sources")
