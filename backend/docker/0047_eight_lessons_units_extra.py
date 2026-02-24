"""8 занятий: units_per_session, base/extra units, lesson_slot_extra_policy.
Идемпотентная версия для Docker: при сборке подменяет версию в alembic/versions/.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0047_eight_lessons"
down_revision = "0046_custom_lessons"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return name in inspect(conn).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    if not _table_exists(conn, table):
        return False
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "groups", "units_per_session"):
        op.add_column("groups", sa.Column("units_per_session", sa.Integer(), nullable=False, server_default="1"))
    if not _column_exists(conn, "groups", "extra_rate_per_unit"):
        op.add_column("groups", sa.Column("extra_rate_per_unit", sa.Float(), nullable=True))
    if not _column_exists(conn, "lesson_attendance", "base_units_applied"):
        op.add_column("lesson_attendance", sa.Column("base_units_applied", sa.Integer(), nullable=True))
    if not _column_exists(conn, "lesson_attendance", "extra_units_applied"):
        op.add_column("lesson_attendance", sa.Column("extra_units_applied", sa.Integer(), nullable=True))
    if not _table_exists(conn, "lesson_slot_extra_policy"):
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
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_id ON lesson_slot_extra_policy (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_group_id ON lesson_slot_extra_policy (group_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_slot_extra_policy_lesson_date ON lesson_slot_extra_policy (lesson_date)")


def downgrade() -> None:
    op.drop_table("lesson_slot_extra_policy")
    op.drop_column("lesson_attendance", "extra_units_applied")
    op.drop_column("lesson_attendance", "base_units_applied")
    op.drop_column("groups", "extra_rate_per_unit")
    op.drop_column("groups", "units_per_session")
    pass
