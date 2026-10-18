"""SMM channel verification — configured != verified. UI should not claim a
channel is connected until a real API check against it has succeeded (see
services/smm_projects/channels.verify_channel()).

Revision ID: 0231
Revises: 0230
Create Date: 2026-10-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0231"
down_revision = "0230"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_channel_configs", sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("smm_channel_configs", sa.Column("verification_error", sa.Text(), nullable=True))
    op.add_column("smm_channel_configs", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("smm_channel_configs", "verified_at")
    op.drop_column("smm_channel_configs", "verification_error")
    op.drop_column("smm_channel_configs", "verified")
