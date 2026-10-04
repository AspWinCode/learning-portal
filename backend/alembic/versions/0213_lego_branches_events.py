"""LEGO: филиалы (с finance target на каждый) и разовые мастер-классы

Revision ID: 0213_lego_branches_events
Revises: 0212_lego_leninets
Create Date: 2026-10-04

1. lego_branches — филиал со своим finance target. Сидится филиал «Ленинец» (target leninets).
2. lego_groups.branch_id — существующие группы привязываются к «Ленинцу».
3. lego_events — разовый мастер-класс (дата, цена, вместимость).
4. lego_event_registrations — запись участника на мастер-класс (unique event_id+student_id).
5. lego_payments.event_id — разовая оплата мастер-класса (без периода месячного тарифа).

Откат удаляет новые таблицы и колонки. Target филиала не удаляется (на него ссылаются проводки).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0213_lego_branches_events"
down_revision = "0212_lego_leninets"
branch_labels = None
depends_on = None


def _tables(conn) -> set:
    return set(inspect(conn).get_table_names())


def _columns(conn, table: str) -> set:
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    conn = op.get_bind()
    tables = _tables(conn)

    if "lego_branches" not in tables:
        op.create_table(
            "lego_branches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(64), nullable=False, unique=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("finance_target_id", sa.Integer(), sa.ForeignKey("finance_targets.id"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_lego_branches_id", "lego_branches", ["id"])
        op.create_index("ix_lego_branches_code", "lego_branches", ["code"])

    # Сид филиала «Ленинец». Target leninets уже засижен в 0212; здесь страхуемся от пустой базы.
    conn.execute(
        sa.text(
            "INSERT INTO finance_targets (code, name, is_active, is_personal, created_at) "
            "SELECT 'leninets', 'LEGO — Ленинец', true, false, now() "
            "WHERE NOT EXISTS (SELECT 1 FROM finance_targets WHERE code = 'leninets')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO lego_branches (code, name, finance_target_id, is_active, created_at) "
            "SELECT 'leninets', 'Ленинец', ft.id, true, now() FROM finance_targets ft "
            "WHERE ft.code = 'leninets' "
            "AND NOT EXISTS (SELECT 1 FROM lego_branches WHERE code = 'leninets')"
        )
    )

    if "branch_id" not in _columns(conn, "lego_groups"):
        op.add_column("lego_groups", sa.Column("branch_id", sa.Integer(), sa.ForeignKey("lego_branches.id"), nullable=True))
        op.create_index("ix_lego_groups_branch_id", "lego_groups", ["branch_id"])
    conn.execute(
        sa.text(
            "UPDATE lego_groups SET branch_id = (SELECT id FROM lego_branches WHERE code = 'leninets') "
            "WHERE branch_id IS NULL"
        )
    )

    if "lego_events" not in tables:
        op.create_table(
            "lego_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("branch_id", sa.Integer(), sa.ForeignKey("lego_branches.id"), nullable=False),
            sa.Column("title", sa.String(256), nullable=False),
            sa.Column("event_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("price", sa.Numeric(12, 2), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="planned"),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_lego_events_id", "lego_events", ["id"])
        op.create_index("ix_lego_events_branch_id", "lego_events", ["branch_id"])
        op.create_index("ix_lego_events_event_date", "lego_events", ["event_date"])
        op.create_index("ix_lego_events_status", "lego_events", ["status"])

    if "lego_event_registrations" not in tables:
        op.create_table(
            "lego_event_registrations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("event_id", sa.Integer(), sa.ForeignKey("lego_events.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("lego_students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("payment_id", sa.Integer(), sa.ForeignKey("lego_payments.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("event_id", "student_id", name="uq_lego_event_registration"),
        )
        op.create_index("ix_lego_event_registrations_id", "lego_event_registrations", ["id"])
        op.create_index("ix_lego_event_registrations_event_id", "lego_event_registrations", ["event_id"])
        op.create_index("ix_lego_event_registrations_student_id", "lego_event_registrations", ["student_id"])

    if "event_id" not in _columns(conn, "lego_payments"):
        op.add_column("lego_payments", sa.Column("event_id", sa.Integer(), sa.ForeignKey("lego_events.id"), nullable=True))
        op.create_index("ix_lego_payments_event_id", "lego_payments", ["event_id"])


def downgrade() -> None:
    conn = op.get_bind()
    tables = _tables(conn)
    if "event_id" in _columns(conn, "lego_payments"):
        op.drop_index("ix_lego_payments_event_id", table_name="lego_payments")
        op.drop_column("lego_payments", "event_id")
    for table in ("lego_event_registrations", "lego_events"):
        if table in tables:
            op.drop_table(table)
    if "branch_id" in _columns(conn, "lego_groups"):
        op.drop_index("ix_lego_groups_branch_id", table_name="lego_groups")
        op.drop_column("lego_groups", "branch_id")
    if "lego_branches" in tables:
        op.drop_table("lego_branches")
