"""Link email_broadcasts to campaigns for automatic stage tracking.

Revision ID: 0156
Revises: 0155
Create Date: 2026-07-27
"""

revision = '0156'
down_revision = '0155'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column(
        "email_broadcasts",
        sa.Column("campaign_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_email_broadcasts_campaign_id",
        "email_broadcasts",
        "campaigns",
        ["campaign_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_email_broadcasts_campaign_id", "email_broadcasts", ["campaign_id"])


def downgrade():
    op.drop_index("ix_email_broadcasts_campaign_id", table_name="email_broadcasts")
    op.drop_constraint("fk_email_broadcasts_campaign_id", "email_broadcasts", type_="foreignkey")
    op.drop_column("email_broadcasts", "campaign_id")
