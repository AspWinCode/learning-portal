"""add b2b_documents table

Revision ID: 0099_b2b_documents
Revises: 0098_add_missing_foreign_key_indexes
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0099_b2b_documents"
down_revision = "0098_add_missing_foreign_key_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "b2b_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("b2b_school_id", sa.Integer(), sa.ForeignKey("b2b_schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("file_name", sa.String(256), nullable=False),
        sa.Column("file_data", sa.Text(), nullable=False),
        sa.Column("file_size_kb", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(128), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_b2b_documents_b2b_school_id", "b2b_documents", ["b2b_school_id"], if_not_exists=True)
    op.create_index("ix_b2b_documents_uploaded_by_id", "b2b_documents", ["uploaded_by_id"], if_not_exists=True)


def downgrade():
    op.drop_table("b2b_documents")
