"""Campaign work settings dictionaries

Revision ID: 0103_campaign_work_settings
Revises: 0102_b2b_school_card_fields
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa


revision = "0103_campaign_work_settings"
down_revision = "0102_b2b_school_card_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_dictionary_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("value", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category", "value", name="uq_campaign_dictionary_category_value"),
    )
    op.create_index("ix_campaign_dictionary_items_category", "campaign_dictionary_items", ["category"], unique=False)
    op.create_index("ix_campaign_dictionary_items_id", "campaign_dictionary_items", ["id"], unique=False)
    op.create_index("ix_campaign_dictionary_items_is_active", "campaign_dictionary_items", ["is_active"], unique=False)

    items = [
        ("campaign_type", "game_jam", "Game Jam", 10),
        ("campaign_type", "olympiad", "Олимпиада", 20),
        ("campaign_type", "league", "Лига", 30),
        ("campaign_type", "online_event", "Онлайн-ивент", 40),
        ("campaign_format", "offline", "Офлайн", 10),
        ("campaign_format", "online", "Онлайн", 20),
        ("campaign_scale", "city", "По городу", 10),
        ("campaign_scale", "region", "Регион", 20),
        ("campaign_scale", "all_russia", "Вся Россия", 30),
    ]
    op.bulk_insert(
        sa.table(
            "campaign_dictionary_items",
            sa.column("category", sa.String),
            sa.column("value", sa.String),
            sa.column("label", sa.String),
            sa.column("position", sa.Integer),
        ),
        [{"category": c, "value": v, "label": l, "position": p} for c, v, l, p in items],
    )


def downgrade() -> None:
    op.drop_index("ix_campaign_dictionary_items_is_active", table_name="campaign_dictionary_items")
    op.drop_index("ix_campaign_dictionary_items_id", table_name="campaign_dictionary_items")
    op.drop_index("ix_campaign_dictionary_items_category", table_name="campaign_dictionary_items")
    op.drop_table("campaign_dictionary_items")
