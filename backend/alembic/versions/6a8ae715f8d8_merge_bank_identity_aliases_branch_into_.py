"""merge bank_identity_aliases branch into main

Revision ID: 6a8ae715f8d8
Revises: 0213_lego_branches_events, 0150_bank_identity_aliases_and_dedupe
Create Date: 2026-10-06 01:39:07.224504

"""

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '6a8ae715f8d8'
down_revision = ('0213_lego_branches_events', '0150_bank_identity_aliases_and_dedupe')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass


