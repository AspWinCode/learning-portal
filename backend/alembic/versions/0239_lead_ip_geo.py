"""Store request IP and resolved city for leads."""
from alembic import op
import sqlalchemy as sa

revision = "0239"
down_revision = "0238"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("ip_address", sa.String(length=45), nullable=True))
    op.add_column("leads", sa.Column("ip_city", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "ip_city")
    op.drop_column("leads", "ip_address")
