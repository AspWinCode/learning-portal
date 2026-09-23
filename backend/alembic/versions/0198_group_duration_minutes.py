"""groups: units_per_session -> duration_minutes; lesson_attendance base/extra_units_applied -> Float

Заменяет абстрактные "юниты" на реальную продолжительность занятия в минутах.
Данные существующих групп переносятся без изменения поведения списания:
duration_minutes = units_per_session * 60 (было 1 юнит = 1 час по соглашению).

Revision ID: 0198
Revises: 0197
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0198"
down_revision = "0197"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
    )
    op.execute("UPDATE groups SET duration_minutes = units_per_session * 60")
    op.drop_column("groups", "units_per_session")

    op.alter_column(
        "lesson_attendance",
        "base_units_applied",
        type_=sa.Float(),
        postgresql_using="base_units_applied::double precision",
    )
    op.alter_column(
        "lesson_attendance",
        "extra_units_applied",
        type_=sa.Float(),
        postgresql_using="extra_units_applied::double precision",
    )


def downgrade() -> None:
    op.add_column(
        "groups",
        sa.Column("units_per_session", sa.Integer(), nullable=False, server_default="1"),
    )
    op.execute("UPDATE groups SET units_per_session = GREATEST(1, ROUND(duration_minutes / 60.0))")
    op.drop_column("groups", "duration_minutes")

    op.alter_column(
        "lesson_attendance",
        "base_units_applied",
        type_=sa.Integer(),
        postgresql_using="ROUND(base_units_applied)::integer",
    )
    op.alter_column(
        "lesson_attendance",
        "extra_units_applied",
        type_=sa.Integer(),
        postgresql_using="ROUND(extra_units_applied)::integer",
    )
