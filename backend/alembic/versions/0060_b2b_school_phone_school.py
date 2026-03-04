"""B2B schools: add phone_school field

Revision ID: 0060_b2b_school_phone_school
Revises: 0059_b2b_project_archived
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa


revision = "0060_b2b_school_phone_school"
down_revision = "0059_b2b_project_archived"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
      "b2b_schools",
      sa.Column("phone_school", sa.String(length=64), nullable=True),
  )


def downgrade() -> None:
  op.drop_column("b2b_schools", "phone_school")

