"""Classify visual references by their role in SMM generation.

Revision ID: 0249
Revises: 0248
"""
import sqlalchemy as sa
from alembic import op

revision = "0249"
down_revision = "0248"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_knowledge_items", sa.Column("visual_role", sa.String(length=24), nullable=True))
    op.execute(sa.text(
        "UPDATE smm_knowledge_items SET visual_role = CASE "
        "WHEN lower(title || ' ' || coalesce(content, '')) LIKE '%персонаж%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%маскот%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%герой%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%героин%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%mascot%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%character%' THEN 'character' "
        "WHEN lower(title || ' ' || coalesce(content, '')) LIKE '%композици%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%ракурс%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%макет%' THEN 'composition' "
        "WHEN lower(title || ' ' || coalesce(content, '')) LIKE '%пример поста%' "
        "OR lower(title || ' ' || coalesce(content, '')) LIKE '%пример публикац%' THEN 'example' "
        "ELSE 'style' END "
        "WHERE source_type = 'image_reference' OR lower(coalesce(content_type, '')) LIKE 'image/%'"
    ))


def downgrade() -> None:
    op.drop_column("smm_knowledge_items", "visual_role")
