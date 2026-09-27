"""Add project field to topics.

Revision ID: 0205
Revises: 0204
Create Date: 2026-09-27

Необязательное текстовое поле "Проект" внутри темы — краткое описание
проекта, который делают в рамках темы, отдельно от итогового результата
(final_result).
"""
from alembic import op
import sqlalchemy as sa


revision = "0205"
down_revision = "0204"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("project", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "project")
