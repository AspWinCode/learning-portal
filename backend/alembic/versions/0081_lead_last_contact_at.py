"""0081: add last_contact_at to leads

Revision ID: 0081_lead_last_contact_at
Revises: 0080_lead_activities
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0081_lead_last_contact_at"
down_revision = "0080_lead_activities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='leads' AND column_name='last_contact_at'"
    )).fetchone()
    if not has_col:
        op.add_column(
            "leads",
            sa.Column("last_contact_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_leads_last_contact_at", "leads", ["last_contact_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leads_last_contact_at", table_name="leads")
    op.drop_column("leads", "last_contact_at")
