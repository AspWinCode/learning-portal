"""transcriptions

Revision ID: 0133_transcriptions
Revises: 0132_dedupe_tochka_generic_name_duplicates
Create Date: 2026-07-02
"""

import sqlalchemy as sa
from alembic import op

revision = "0133_transcriptions"
down_revision = "0132_dedupe_tochka_generic_name_duplicates"
branch_labels = None
depends_on = None

TRANSCRIPTION_STATUS_ENUM = sa.Enum(
    "pending", "processing", "done", "error", name="transcriptionstatus"
)


def upgrade() -> None:
    TRANSCRIPTION_STATUS_ENUM.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "transcriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum("pending", "processing", "done", "error", name="transcriptionstatus", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("language", sa.String(length=16), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("storage_key"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcriptions_id"), "transcriptions", ["id"], unique=False)
    op.create_index(op.f("ix_transcriptions_owner_id"), "transcriptions", ["owner_id"], unique=False)
    op.create_index(op.f("ix_transcriptions_created_at"), "transcriptions", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_transcriptions_created_at"), table_name="transcriptions")
    op.drop_index(op.f("ix_transcriptions_owner_id"), table_name="transcriptions")
    op.drop_index(op.f("ix_transcriptions_id"), table_name="transcriptions")
    op.drop_table("transcriptions")
    TRANSCRIPTION_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
