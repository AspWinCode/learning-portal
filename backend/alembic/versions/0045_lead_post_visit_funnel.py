"""Add post-visit funnel fields to leads.

Revision ID: 0045_lead_post_visit_funnel
Revises: 0044_task_description
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0045_lead_post_visit_funnel"
down_revision = "0044_task_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("post_visit_stage", sa.String(length=64), nullable=True))
    op.add_column("leads", sa.Column("post_visit_review", sa.Text(), nullable=True))
    op.add_column("leads", sa.Column("post_visit_project_date", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_leads_post_visit_stage", "leads", ["post_visit_stage"], if_not_exists=True)
    # Заполнить стартовую стадию для лидов, по которым уже нажимали «Пришел» на мероприятии
    op.execute(
        """
        UPDATE leads
        SET post_visit_stage = 'new'
        WHERE post_visit_stage IS NULL
          AND status = 'demo'
          AND id IN (
            SELECT DISTINCT lead_id
            FROM event_registrations
            WHERE note ILIKE '%[came]%'
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_leads_post_visit_stage", table_name="leads")
    op.drop_column("leads", "post_visit_project_date")
    op.drop_column("leads", "post_visit_review")
    op.drop_column("leads", "post_visit_stage")

