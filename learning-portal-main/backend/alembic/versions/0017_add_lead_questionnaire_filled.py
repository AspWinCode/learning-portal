"""Add questionnaire_filled to leads

Revision ID: 0017_add_lead_questionnaire_filled
Revises: 0016_add_no_answer_lead_stage
Create Date: 2026-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = "0017_add_lead_questionnaire_filled"
down_revision = "0016_add_no_answer_lead_stage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("questionnaire_filled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_leads_questionnaire_filled", "leads", ["questionnaire_filled"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leads_questionnaire_filled", table_name="leads")
    op.drop_column("leads", "questionnaire_filled")
