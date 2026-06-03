"""Custom campaign funnel stages

Revision ID: 0104_campaign_stages
Revises: 0103_campaign_work_settings
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0104_campaign_stages"
down_revision = "0103_campaign_work_settings"
branch_labels = None
depends_on = None


_GAME_JAM = [
    ("not_contacted", "Не связались", False),
    ("contact_established", "Контакт установлен", False),
    ("director_agreed", "Директор согласен", False),
    ("contact_person_received", "Получен контакт ответственного", False),
    ("agreed_to_class_visits", "Согласованы обходы", False),
    ("info_sent_to_parents", "Инфо отправлено родителям", False),
    ("declined", "Отказ", True),
    ("participated", "Участвовали", False),
    ("leads_received", "Лиды получены", True),
]

_ONLINE = [
    ("not_contacted", "Не связались", False),
    ("invited", "Приглашены", False),
    ("info_sent", "Инфо отправлено", False),
    ("confirmed", "Подтвердили", False),
    ("declined", "Отказ", True),
    ("participated", "Участвовали", False),
]


def _default_for(campaign_type: str):
    return _ONLINE if campaign_type == "online_event" else _GAME_JAM


def upgrade() -> None:
    op.create_table(
        "campaign_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_terminal", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "key", name="uq_campaign_stages_campaign_key"),
    )
    op.create_index("ix_campaign_stages_id", "campaign_stages", ["id"], unique=False)
    op.create_index("ix_campaign_stages_campaign_id", "campaign_stages", ["campaign_id"], unique=False)

    # --- Backfill: засеять этапы для уже существующих кампаний ---
    bind = op.get_bind()
    campaigns = bind.execute(sa.text("SELECT id, type FROM campaigns")).fetchall()
    stage_table = sa.table(
        "campaign_stages",
        sa.column("campaign_id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("position", sa.Integer),
        sa.column("is_terminal", sa.Boolean),
    )
    rows = []
    seeded_keys = {}  # campaign_id -> set(keys)
    for campaign_id, ctype in campaigns:
        keys = set()
        for index, (key, label, terminal) in enumerate(_default_for(ctype or "")):
            rows.append({
                "campaign_id": campaign_id,
                "key": key,
                "label": label,
                "position": (index + 1) * 10,
                "is_terminal": terminal,
            })
            keys.add(key)
        seeded_keys[campaign_id] = keys

    # Любые существующие стадии школ, не попавшие в дефолтный набор, добавляем в конец,
    # чтобы не осталось "осиротевших" ключей.
    existing = bind.execute(
        sa.text("SELECT DISTINCT campaign_id, stage FROM school_campaigns WHERE stage IS NOT NULL")
    ).fetchall()
    extra_position = {}
    for campaign_id, stage in existing:
        if campaign_id not in seeded_keys:
            continue
        if stage in seeded_keys[campaign_id]:
            continue
        seeded_keys[campaign_id].add(stage)
        pos_base = extra_position.get(campaign_id, len(_default_for("")) + 1)
        extra_position[campaign_id] = pos_base + 1
        rows.append({
            "campaign_id": campaign_id,
            "key": stage,
            "label": stage,
            "position": pos_base * 10,
            "is_terminal": False,
        })

    if rows:
        op.bulk_insert(stage_table, rows)


def downgrade() -> None:
    op.drop_index("ix_campaign_stages_campaign_id", table_name="campaign_stages")
    op.drop_index("ix_campaign_stages_id", table_name="campaign_stages")
    op.drop_table("campaign_stages")
