"""owner-dashboard: nps_responses — квартальный опрос NPS в кабинете родителя

Revision ID: 0195
Revises: 0194
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0195"
down_revision = "0194"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nps_responses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.Column("period_label", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("parent_id", "period_label", name="uq_nps_response_parent_period"),
    )
    op.create_index(op.f("ix_nps_responses_parent_id"), "nps_responses", ["parent_id"])
    op.create_index(op.f("ix_nps_responses_period_label"), "nps_responses", ["period_label"])


def downgrade() -> None:
    op.drop_index(op.f("ix_nps_responses_period_label"), table_name="nps_responses")
    op.drop_index(op.f("ix_nps_responses_parent_id"), table_name="nps_responses")
    op.drop_table("nps_responses")
