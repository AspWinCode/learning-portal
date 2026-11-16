"""Store the editorial genre assigned to each content-plan item.

The plan itself already stores the selected genre list (0238), but that's
just the menu offered to the planner LLM for the whole period — individual
items had no durable genre, so draft generation could not tell "Размышления
организаторов" apart from a generic post and always used the same brief-
driven prompt.
"""
from alembic import op
import sqlalchemy as sa

revision = "0242"
down_revision = "0241"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smm_content_plan_items", sa.Column("genre", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("smm_content_plan_items", "genre")
