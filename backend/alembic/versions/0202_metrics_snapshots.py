"""Add metrics_snapshots table for monthly KPI snapshots.

Revision ID: 0202
Revises: 0201
Create Date: 2026-09-26

Owner wants to track how key metrics (owner dashboard KPIs, academy metrics,
finance P&L) change month over month. This table stores one JSON payload per
(period_month, category), captured by a monthly background job on the last
day of each month, so historical trends can be charted later without
recomputing them from raw transactional data.
"""
from alembic import op
import sqlalchemy as sa


revision = "0202"
down_revision = "0201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "metrics_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_month", "category", name="uq_metrics_snapshot_period_category"),
    )
    op.create_index(
        op.f("ix_metrics_snapshots_period_month"),
        "metrics_snapshots",
        ["period_month"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_metrics_snapshots_period_month"), table_name="metrics_snapshots")
    op.drop_table("metrics_snapshots")
