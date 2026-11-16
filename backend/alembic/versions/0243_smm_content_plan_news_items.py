"""Store manually pasted news snippets for the "programming_news" genre.

Automatic news search was ruled out (no funded search API in this project) —
the editor pastes real news text instead, and draft generation for the
"Новости программирования и геймдева" genre grounds itself in these snippets
rather than letting the model invent a "news-shaped" post with no real facts.
"""
from alembic import op
import sqlalchemy as sa

revision = "0243"
down_revision = "0242"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_content_plans", sa.Column("news_items", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("smm_content_plans", "news_items")
