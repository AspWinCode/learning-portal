"""Distinguish Zen RSS delivery from confirmed social publication.

Revision ID: 0251
Revises: 0250
"""
import sqlalchemy as sa
from alembic import op

revision = "0251"
down_revision = "0250"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE smm_publications SET status = 'feed_ready' "
        "WHERE channel = 'zen' AND status = 'success'"
    ))
    op.execute(sa.text(
        "UPDATE smm_publish_logs SET status = 'feed_ready' "
        "WHERE channel = 'zen' AND status = 'success'"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "UPDATE smm_publications SET status = 'success' "
        "WHERE channel = 'zen' AND status = 'feed_ready'"
    ))
    op.execute(sa.text(
        "UPDATE smm_publish_logs SET status = 'success' "
        "WHERE channel = 'zen' AND status = 'feed_ready'"
    ))
