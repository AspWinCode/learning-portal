"""Add trainer profile fields to users (phone, banks, city, telegram, etc.).

Revision ID: 0050_trainer_profile
Revises: 0049_trainer_calculations
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0050_trainer_profile"
down_revision = "0049_trainer_calculations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("phone_extra", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("trainer_lesson_formats", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("trainer_banks", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("trainer_telegram", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("is_self_employed", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("users", sa.Column("is_ip", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("users", sa.Column("work_schedule", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("qualification", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("trainer_comment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trainer_comment")
    op.drop_column("users", "qualification")
    op.drop_column("users", "work_schedule")
    op.drop_column("users", "is_ip")
    op.drop_column("users", "is_self_employed")
    op.drop_column("users", "trainer_telegram")
    op.drop_column("users", "city")
    op.drop_column("users", "trainer_banks")
    op.drop_column("users", "trainer_lesson_formats")
    op.drop_column("users", "phone_extra")
    op.drop_column("users", "phone")
