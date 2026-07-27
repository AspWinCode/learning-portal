"""Add email_sent and email_opened stages to existing campaigns.

Revision ID: 0157
Revises: 0156
Create Date: 2026-07-27
"""

revision = '0157'
down_revision = '0156'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column, select, text


def upgrade():
    conn = op.get_bind()

    # Tables
    stages_tbl = sa.table(
        "campaign_stages",
        sa.column("id", sa.Integer),
        sa.column("campaign_id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("position", sa.Integer),
        sa.column("is_terminal", sa.Boolean),
    )

    # Find all non-game_jam campaigns
    campaign_rows = conn.execute(
        text("SELECT id FROM campaigns WHERE is_game_jam = false OR is_game_jam IS NULL")
    ).fetchall()

    for (campaign_id,) in campaign_rows:
        # Check existing stages
        existing = conn.execute(
            sa.select(stages_tbl.c.key, stages_tbl.c.position).where(
                stages_tbl.c.campaign_id == campaign_id
            )
        ).fetchall()

        existing_keys = {r[0] for r in existing}
        existing_positions = {r[1] for r in existing}

        if "email_sent" in existing_keys and "email_opened" in existing_keys:
            continue  # already have both, skip

        # Find 'not_contacted' position to insert after it
        not_contacted_pos = conn.execute(
            sa.select(stages_tbl.c.position).where(
                stages_tbl.c.campaign_id == campaign_id,
                stages_tbl.c.key == "not_contacted",
            )
        ).scalar()

        if not_contacted_pos is None:
            # Fallback: insert after position 10 (typical first stage)
            not_contacted_pos = 10

        # email_sent goes right after not_contacted
        email_sent_pos = not_contacted_pos + 5
        email_opened_pos = not_contacted_pos + 10

        # Shift all stages that come after not_contacted up by 20
        conn.execute(
            sa.update(stages_tbl)
            .where(
                stages_tbl.c.campaign_id == campaign_id,
                stages_tbl.c.position > not_contacted_pos,
            )
            .values(position=stages_tbl.c.position + 20)
        )

        # Insert email_sent if missing
        if "email_sent" not in existing_keys:
            conn.execute(
                stages_tbl.insert().values(
                    campaign_id=campaign_id,
                    key="email_sent",
                    label="Отправили письмо на почту",
                    position=email_sent_pos,
                    is_terminal=False,
                )
            )

        # Insert email_opened if missing
        if "email_opened" not in existing_keys:
            conn.execute(
                stages_tbl.insert().values(
                    campaign_id=campaign_id,
                    key="email_opened",
                    label="Письмо открыли",
                    position=email_opened_pos,
                    is_terminal=False,
                )
            )


def downgrade():
    conn = op.get_bind()
    stages_tbl = sa.table(
        "campaign_stages",
        sa.column("key", sa.String),
    )
    conn.execute(
        sa.delete(stages_tbl).where(
            stages_tbl.c.key.in_(["email_sent", "email_opened"])
        )
    )
