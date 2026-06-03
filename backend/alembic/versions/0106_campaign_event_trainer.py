"""Add trainer to campaign events.

Revision ID: 0106_campaign_event_trainer
Revises: 0105_game_jam_mode
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa


revision = "0106_campaign_event_trainer"
down_revision = "0105_game_jam_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaign_events", sa.Column("trainer_id", sa.Integer(), nullable=True))
    op.create_index("ix_campaign_events_trainer_id", "campaign_events", ["trainer_id"], unique=False, if_not_exists=True)
    op.create_foreign_key(
        "fk_campaign_events_trainer_id_users",
        "campaign_events",
        "users",
        ["trainer_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_campaign_events_trainer_id_users", "campaign_events", type_="foreignkey")
    op.drop_index("ix_campaign_events_trainer_id", table_name="campaign_events")
    op.drop_column("campaign_events", "trainer_id")
