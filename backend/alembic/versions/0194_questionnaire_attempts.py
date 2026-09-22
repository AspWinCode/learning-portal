"""sales: questionnaire_attempts — незавершённые попытки заполнения публичных анкет

Revision ID: 0194
Revises: 0193
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = "0194"
down_revision = "0193"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "questionnaire_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("anketa_type", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("dismissed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_questionnaire_attempts_anketa_type"), "questionnaire_attempts", ["anketa_type"])
    op.create_index(op.f("ix_questionnaire_attempts_dismissed"), "questionnaire_attempts", ["dismissed"])
    op.create_index(op.f("ix_questionnaire_attempts_created_at"), "questionnaire_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_questionnaire_attempts_created_at"), table_name="questionnaire_attempts")
    op.drop_index(op.f("ix_questionnaire_attempts_dismissed"), table_name="questionnaire_attempts")
    op.drop_index(op.f("ix_questionnaire_attempts_anketa_type"), table_name="questionnaire_attempts")
    op.drop_table("questionnaire_attempts")
