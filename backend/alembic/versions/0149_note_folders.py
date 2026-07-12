"""note_folders: folder hierarchy for notes

Revision ID: 0149_note_folders
Revises: 0148_cms_pages
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0149_note_folders"
down_revision = "0148_cms_pages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "note_folders",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["note_folders.id"], ondelete="SET NULL"),
    )
    op.add_column("notes", sa.Column("folder_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notes_folder_id",
        "notes", "note_folders",
        ["folder_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_notes_folder_id", "notes", type_="foreignkey")
    op.drop_column("notes", "folder_id")
    op.drop_table("note_folders")
