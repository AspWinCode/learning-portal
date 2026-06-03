"""Add missing columns to leads table

Revision ID: 0075_leads_missing_columns
Revises: 0074_lead_max_user_id
Create Date: 2026-03-17

"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "0075_leads_missing_columns"
down_revision = "0074_lead_max_user_id"
branch_labels = None
depends_on = None


def _column_exists(conn, table, column):
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "leads", "communication_channel"):
        op.add_column("leads", sa.Column("communication_channel", sa.String(), nullable=True))
    if not _column_exists(conn, "leads", "status_option_id"):
        op.add_column("leads", sa.Column("status_option_id", sa.Integer(), nullable=True))
        op.create_index("ix_leads_status_option_id", "leads", ["status_option_id"], if_not_exists=True)
        op.create_foreign_key(
            "fk_leads_status_option_id_lead_statuses",
            "leads", "lead_statuses",
            ["status_option_id"], ["id"],
            ondelete="SET NULL",
        )
    if not _column_exists(conn, "leads", "no_answer_attempt"):
        op.add_column("leads", sa.Column("no_answer_attempt", sa.Integer(), nullable=True))
        op.create_index("ix_leads_no_answer_attempt", "leads", ["no_answer_attempt"], if_not_exists=True)
    if not _column_exists(conn, "leads", "questionnaire_filled"):
        op.add_column("leads", sa.Column("questionnaire_filled", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.create_index("ix_leads_questionnaire_filled", "leads", ["questionnaire_filled"], if_not_exists=True)
    if not _column_exists(conn, "leads", "b2b_school_id"):
        op.add_column("leads", sa.Column("b2b_school_id", sa.Integer(), nullable=True))
        op.create_index("ix_leads_b2b_school_id", "leads", ["b2b_school_id"], if_not_exists=True)
        op.create_foreign_key(
            "fk_leads_b2b_school_id_b2b_schools",
            "leads", "b2b_schools",
            ["b2b_school_id"], ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "leads", "b2b_school_id"):
        op.drop_constraint("fk_leads_b2b_school_id_b2b_schools", "leads", type_="foreignkey")
        op.drop_index("ix_leads_b2b_school_id", table_name="leads")
        op.drop_column("leads", "b2b_school_id")
    if _column_exists(conn, "leads", "questionnaire_filled"):
        op.drop_index("ix_leads_questionnaire_filled", table_name="leads")
        op.drop_column("leads", "questionnaire_filled")
    if _column_exists(conn, "leads", "no_answer_attempt"):
        op.drop_index("ix_leads_no_answer_attempt", table_name="leads")
        op.drop_column("leads", "no_answer_attempt")
    if _column_exists(conn, "leads", "status_option_id"):
        op.drop_constraint("fk_leads_status_option_id_lead_statuses", "leads", type_="foreignkey")
        op.drop_index("ix_leads_status_option_id", table_name="leads")
        op.drop_column("leads", "status_option_id")
    if _column_exists(conn, "leads", "communication_channel"):
        op.drop_column("leads", "communication_channel")
