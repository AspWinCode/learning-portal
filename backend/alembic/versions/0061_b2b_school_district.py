"""B2B schools: add district field

Revision ID: 0061_b2b_school_district
Revises: 0060_b2b_school_phone_school
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa


revision = "0061_b2b_school_district"
down_revision = "0060_b2b_school_phone_school"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
      "b2b_schools",
      sa.Column("district", sa.String(length=256), nullable=True),
  )


def downgrade() -> None:
  op.drop_column("b2b_schools", "district")

