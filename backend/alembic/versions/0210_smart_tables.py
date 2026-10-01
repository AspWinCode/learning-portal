"""Умные таблицы (Smart Tables) — Phase 1: ядро грида + персистенция.

Workbook -> Sheet -> Column/Row -> Cell, hybrid-хранение (отдельная
строка на cell + материализованный JSONB-снимок строки для быстрого
чтения грида), operation log с инвертированными операциями для undo.
См. docs/smart-tables-architecture.md.

Revision ID: 0210
Revises: 0209
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0210"
down_revision = "0209"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smart_table_workbooks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_smart_table_workbooks_id"), "smart_table_workbooks", ["id"])

    op.create_table(
        "smart_table_members",
        sa.Column("workbook_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="viewer"),
        sa.ForeignKeyConstraint(["workbook_id"], ["smart_table_workbooks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("workbook_id", "user_id"),
    )

    op.create_table(
        "smart_table_sheets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workbook_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("frozen_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("frozen_columns", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["workbook_id"], ["smart_table_workbooks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_smart_table_sheets_id"), "smart_table_sheets", ["id"])
    op.create_index(op.f("ix_smart_table_sheets_workbook_id"), "smart_table_sheets", ["workbook_id"])

    op.create_table(
        "smart_table_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="text"),
        sa.Column("width", sa.Integer(), nullable=False, server_default="160"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["sheet_id"], ["smart_table_sheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_smart_table_columns_id"), "smart_table_columns", ["id"])
    op.create_index(op.f("ix_smart_table_columns_sheet_id"), "smart_table_columns", ["sheet_id"])

    op.create_table(
        "smart_table_rows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False, server_default="32"),
        sa.Column("cells_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["sheet_id"], ["smart_table_sheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_smart_table_rows_id"), "smart_table_rows", ["id"])
    op.create_index("ix_smart_table_rows_sheet_position", "smart_table_rows", ["sheet_id", "position"])

    op.create_table(
        "smart_table_cells",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("row_id", sa.Integer(), nullable=False),
        sa.Column("column_id", sa.Integer(), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("computed_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("formatting", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(["row_id"], ["smart_table_rows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["column_id"], ["smart_table_columns.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("row_id", "column_id", name="uq_smart_table_cell_row_column"),
    )
    op.create_index(op.f("ix_smart_table_cells_id"), "smart_table_cells", ["id"])
    op.create_index(op.f("ix_smart_table_cells_row_id"), "smart_table_cells", ["row_id"])
    op.create_index(op.f("ix_smart_table_cells_column_id"), "smart_table_cells", ["column_id"])

    op.create_table(
        "smart_table_operation_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("operation", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("inverse_operation", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["sheet_id"], ["smart_table_sheets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_smart_table_operation_log_id"), "smart_table_operation_log", ["id"])
    op.create_index(
        "ix_smart_table_oplog_sheet_created", "smart_table_operation_log", ["sheet_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("smart_table_operation_log")
    op.drop_table("smart_table_cells")
    op.drop_table("smart_table_rows")
    op.drop_table("smart_table_columns")
    op.drop_table("smart_table_sheets")
    op.drop_table("smart_table_members")
    op.drop_table("smart_table_workbooks")
