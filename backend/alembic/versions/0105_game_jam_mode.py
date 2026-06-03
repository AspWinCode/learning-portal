"""Game Jam mode: is_game_jam, host_b2b_school_id, campaign_event_stages, jam_stage

Revision ID: 0105_game_jam_mode
Revises: 0104_campaign_stages
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0105_game_jam_mode"
down_revision = "0104_campaign_stages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Campaign.is_game_jam
    op.add_column("campaigns", sa.Column("is_game_jam", sa.Boolean(), nullable=False, server_default="false"))

    # 2. CampaignEvent.host_b2b_school_id
    op.add_column("campaign_events", sa.Column("host_b2b_school_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_campaign_events_host_school",
        "campaign_events", "b2b_schools",
        ["host_b2b_school_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_campaign_events_host_b2b_school_id", "campaign_events", ["host_b2b_school_id"], unique=False)

    # 3. SchoolCampaignEvent.jam_stage
    op.add_column("school_campaign_events", sa.Column("jam_stage", sa.String(length=64), nullable=True))
    op.create_index("ix_school_campaign_events_jam_stage", "school_campaign_events", ["jam_stage"], unique=False)

    # 4. Таблица этапов джема
    op.create_table(
        "campaign_event_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_event_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_terminal", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["campaign_event_id"], ["campaign_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_event_id", "key", name="uq_campaign_event_stages_event_key"),
    )
    op.create_index("ix_campaign_event_stages_id", "campaign_event_stages", ["id"], unique=False)
    op.create_index("ix_campaign_event_stages_campaign_event_id", "campaign_event_stages", ["campaign_event_id"], unique=False)

    # 5. Backfill: засеять этапы для уже существующих Game Jam кампаний
    _DEFAULT_JAM_STAGES = [
        ("registered", "Зарегистрированы", False),
        ("briefed", "Прошли брифинг", False),
        ("working", "В процессе", False),
        ("submitted", "Сдали работу", False),
        ("judged", "Оценены", False),
        ("completed", "Завершили", True),
    ]
    bind = op.get_bind()
    # Найдём все события у Game Jam кампаний
    events = bind.execute(sa.text("""
        SELECT ce.id FROM campaign_events ce
        JOIN campaigns c ON c.id = ce.campaign_id
        WHERE c.is_game_jam = true
    """)).fetchall()
    stage_table = sa.table(
        "campaign_event_stages",
        sa.column("campaign_event_id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("position", sa.Integer),
        sa.column("is_terminal", sa.Boolean),
    )
    rows = []
    for (event_id,) in events:
        for idx, (key, label, terminal) in enumerate(_DEFAULT_JAM_STAGES):
            rows.append({
                "campaign_event_id": event_id,
                "key": key,
                "label": label,
                "position": (idx + 1) * 10,
                "is_terminal": terminal,
            })
    if rows:
        op.bulk_insert(stage_table, rows)


def downgrade() -> None:
    op.drop_table("campaign_event_stages")
    op.drop_index("ix_school_campaign_events_jam_stage", table_name="school_campaign_events")
    op.drop_column("school_campaign_events", "jam_stage")
    op.drop_constraint("fk_campaign_events_host_school", "campaign_events", type_="foreignkey")
    op.drop_index("ix_campaign_events_host_b2b_school_id", table_name="campaign_events")
    op.drop_column("campaign_events", "host_b2b_school_id")
    op.drop_column("campaigns", "is_game_jam")
