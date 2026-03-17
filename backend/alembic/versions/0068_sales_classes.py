"""Add sales_classes table (справочник классов для лидов).

Revision ID: 0068_sales_classes
Revises: 0067_lead_questionnaire_data
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = "0068_sales_classes"
down_revision = "0067_lead_questionnaire_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_classes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_sales_classes_name", "sales_classes", ["name"], unique=True)
    op.create_index("ix_sales_classes_is_active", "sales_classes", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sales_classes_is_active", table_name="sales_classes")
    op.drop_index("ix_sales_classes_name", table_name="sales_classes")
    op.drop_table("sales_classes")
