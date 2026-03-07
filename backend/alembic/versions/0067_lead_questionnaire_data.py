"""Lead questionnaire_data for form-submitted leads.

Revision ID: 0067_lead_questionnaire_data
Revises: 0066_lead_student_convert
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = "0067_lead_questionnaire_data"
down_revision = "0066_lead_student_convert"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("questionnaire_data", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "questionnaire_data")
