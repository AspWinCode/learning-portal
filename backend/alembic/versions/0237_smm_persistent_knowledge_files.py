"""Store persistent SMM knowledge files and extracted context.

Revision ID: 0237
Revises: 0236
"""

import sqlalchemy as sa
from alembic import op


revision = "0237"
down_revision = "0236"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_knowledge_items", sa.Column("storage_key", sa.String(512), nullable=True))
    op.add_column("smm_knowledge_items", sa.Column("original_filename", sa.String(256), nullable=True))
    op.add_column("smm_knowledge_items", sa.Column("content_type", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("smm_knowledge_items", "content_type")
    op.drop_column("smm_knowledge_items", "original_filename")
    op.drop_column("smm_knowledge_items", "storage_key")
