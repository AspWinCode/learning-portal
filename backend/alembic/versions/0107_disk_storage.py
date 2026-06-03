"""Add disk storage items.

Revision ID: 0107_disk_storage
Revises: 0106_campaign_event_trainer
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa


revision = "0107_disk_storage"
down_revision = "0106_campaign_event_trainer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "disk_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("item_type", sa.String(length=16), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_id"], ["disk_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_disk_items_id", "disk_items", ["id"], unique=False)
    op.create_index("ix_disk_items_name", "disk_items", ["name"], unique=False)
    op.create_index("ix_disk_items_item_type", "disk_items", ["item_type"], unique=False)
    op.create_index("ix_disk_items_parent_id", "disk_items", ["parent_id"], unique=False)
    op.create_index("ix_disk_items_storage_key", "disk_items", ["storage_key"], unique=True)
    op.create_index("ix_disk_items_owner_id", "disk_items", ["owner_id"], unique=False)
    op.create_index("ix_disk_items_created_at", "disk_items", ["created_at"], unique=False)
    op.create_index("ix_disk_items_deleted_at", "disk_items", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_disk_items_deleted_at", table_name="disk_items")
    op.drop_index("ix_disk_items_created_at", table_name="disk_items")
    op.drop_index("ix_disk_items_owner_id", table_name="disk_items")
    op.drop_index("ix_disk_items_storage_key", table_name="disk_items")
    op.drop_index("ix_disk_items_parent_id", table_name="disk_items")
    op.drop_index("ix_disk_items_item_type", table_name="disk_items")
    op.drop_index("ix_disk_items_name", table_name="disk_items")
    op.drop_index("ix_disk_items_id", table_name="disk_items")
    op.drop_table("disk_items")
