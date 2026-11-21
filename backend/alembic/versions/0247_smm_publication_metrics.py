"""Store social post engagement metrics.

Revision ID: 0247
Revises: 0246
"""
import sqlalchemy as sa
from alembic import op

revision = "0247"
down_revision = "0246"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_publications", sa.Column("metrics_json", sa.JSON(), nullable=True))
    op.add_column("smm_publications", sa.Column("metrics_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("smm_publications", "metrics_updated_at")
    op.drop_column("smm_publications", "metrics_json")
