"""8 занятий: units_per_session, base/extra units, lesson_slot_extra_policy.

Revision ID: 0047_eight_lessons
Revises: 0046_custom_lessons
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa


revision = "0047_eight_lessons"
down_revision = "0046_custom_lessons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # groups: units_per_session, extra_rate_per_unit
    op.add_column("groups", sa.Column("units_per_session", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("groups", sa.Column("extra_rate_per_unit", sa.Float(), nullable=True))

    # lesson_attendance: base_units_applied, extra_units_applied
    op.add_column("lesson_attendance", sa.Column("base_units_applied", sa.Integer(), nullable=True))
    op.add_column("lesson_attendance", sa.Column("extra_units_applied", sa.Integer(), nullable=True))

    # studentaccounttransactionkind: add 'extra_lesson_deduction'
    op.execute(
        """
        ALTER TYPE studentaccounttransactionkind ADD VALUE IF NOT EXISTS 'extra_lesson_deduction';
        """
    )

    # lesson_slot_extra_policy
    op.create_table(
        "lesson_slot_extra_policy",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("group_id", sa.Integer(), nullable=False, index=True),
        sa.Column("lesson_date", sa.Date(), nullable=False, index=True),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("extra_policy", sa.String(16), nullable=False, server_default="free"),
        sa.Column("extra_rate_per_unit", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
        sa.UniqueConstraint("group_id", "lesson_date", "start_time", "end_time", name="uq_lesson_slot_extra_policy_slot"),
    )
    op.create_index("ix_lesson_slot_extra_policy_id", "lesson_slot_extra_policy", ["id"])
    op.create_index("ix_lesson_slot_extra_policy_group_id", "lesson_slot_extra_policy", ["group_id"])
    op.create_index("ix_lesson_slot_extra_policy_lesson_date", "lesson_slot_extra_policy", ["lesson_date"])


def downgrade() -> None:
    op.drop_table("lesson_slot_extra_policy")
    op.drop_column("lesson_attendance", "extra_units_applied")
    op.drop_column("lesson_attendance", "base_units_applied")
    op.drop_column("groups", "extra_rate_per_unit")
    op.drop_column("groups", "units_per_session")
    # Postgres does not support removing enum value easily; leave extra_lesson_deduction
    pass
