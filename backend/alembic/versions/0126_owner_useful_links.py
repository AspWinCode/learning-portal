"""owner useful links

Revision ID: 0126_owner_useful_links
Revises: 0125_finance_model_optional_target
Create Date: 2026-06-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0126_owner_useful_links"
down_revision = "0125_finance_model_optional_target"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_useful_link_folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["parent_id"], ["owner_useful_link_folders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_owner_useful_link_folders_id"), "owner_useful_link_folders", ["id"], unique=False)
    op.create_index(op.f("ix_owner_useful_link_folders_parent_id"), "owner_useful_link_folders", ["parent_id"], unique=False)
    op.create_index(op.f("ix_owner_useful_link_folders_created_by_id"), "owner_useful_link_folders", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_owner_useful_link_folders_created_at"), "owner_useful_link_folders", ["created_at"], unique=False)

    op.create_table(
        "owner_useful_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["folder_id"], ["owner_useful_link_folders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_owner_useful_links_id"), "owner_useful_links", ["id"], unique=False)
    op.create_index(op.f("ix_owner_useful_links_folder_id"), "owner_useful_links", ["folder_id"], unique=False)
    op.create_index(op.f("ix_owner_useful_links_created_by_id"), "owner_useful_links", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_owner_useful_links_created_at"), "owner_useful_links", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_owner_useful_links_created_at"), table_name="owner_useful_links")
    op.drop_index(op.f("ix_owner_useful_links_created_by_id"), table_name="owner_useful_links")
    op.drop_index(op.f("ix_owner_useful_links_folder_id"), table_name="owner_useful_links")
    op.drop_index(op.f("ix_owner_useful_links_id"), table_name="owner_useful_links")
    op.drop_table("owner_useful_links")
    op.drop_index(op.f("ix_owner_useful_link_folders_created_at"), table_name="owner_useful_link_folders")
    op.drop_index(op.f("ix_owner_useful_link_folders_created_by_id"), table_name="owner_useful_link_folders")
    op.drop_index(op.f("ix_owner_useful_link_folders_parent_id"), table_name="owner_useful_link_folders")
    op.drop_index(op.f("ix_owner_useful_link_folders_id"), table_name="owner_useful_link_folders")
    op.drop_table("owner_useful_link_folders")
