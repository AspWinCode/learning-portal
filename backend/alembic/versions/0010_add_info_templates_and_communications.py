"""Add lead info templates and communications

Revision ID: 0010_add_info_templates_and_communications
Revises: 0009_add_sales_sources_templates_and_import_fields
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_add_info_templates_and_communications"
down_revision = "0009_add_sales_sources_templates_and_import_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("pause_reason", sa.String(), nullable=True))

    op.create_table(
        "lead_info_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_lead_info_templates_name", "lead_info_templates", ["name"], unique=True)
    op.create_index("ix_lead_info_templates_is_active", "lead_info_templates", ["is_active"], unique=False)

    op.create_table(
        "lead_communications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("sent_by", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("channel", sa.String(), nullable=False, server_default="messenger"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("pause_reason", sa.String(), nullable=True),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.ForeignKeyConstraint(["sent_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["lead_info_templates.id"]),
    )
    op.create_index("ix_lead_communications_lead_id", "lead_communications", ["lead_id"], unique=False)
    op.create_index("ix_lead_communications_sent_by", "lead_communications", ["sent_by"], unique=False)
    op.create_index("ix_lead_communications_template_id", "lead_communications", ["template_id"], unique=False)
    op.create_index("ix_lead_communications_follow_up_at", "lead_communications", ["follow_up_at"], unique=False)

    op.execute(
        """
        INSERT INTO lead_info_templates (name, body, is_active)
        VALUES
            ('Инфо: мероприятие', 'Здравствуйте! Отправляю подробности по мероприятию. Подскажите, удобно ли участие?', true),
            ('Инфо: пробный урок', 'Добрый день! Отправляю информацию по пробному занятию и ближайшим датам.', true),
            ('Инфо: курс', 'Здравствуйте! Ниже информация по курсу: формат, расписание и стоимость.', true)
        ON CONFLICT (name) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_lead_communications_follow_up_at", table_name="lead_communications")
    op.drop_index("ix_lead_communications_template_id", table_name="lead_communications")
    op.drop_index("ix_lead_communications_sent_by", table_name="lead_communications")
    op.drop_index("ix_lead_communications_lead_id", table_name="lead_communications")
    op.drop_table("lead_communications")

    op.drop_index("ix_lead_info_templates_is_active", table_name="lead_info_templates")
    op.drop_index("ix_lead_info_templates_name", table_name="lead_info_templates")
    op.drop_table("lead_info_templates")

    op.drop_column("leads", "pause_reason")
