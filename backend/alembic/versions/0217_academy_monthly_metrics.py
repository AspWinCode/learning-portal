"""Academy monthly metrics: stable history for owner dashboard.

Adds leads.won_at (fixed at the moment a lead is converted to WON, instead of
relying on updated_at which changes on any edit), student_account_transactions
.payment_format (immutable snapshot of group/individual at payment time,
instead of re-deriving it from the student's *current* abonement), and
students.archived_at/activated_at (minimal status-change timestamps so
"active on date X" can be approximated for past months). Also adds
academy_monthly_snapshots for caching closed months.

Backfill is approximate for historical rows (documented in the owner
dashboard report): won_at falls back to updated_at/created_at, archived_at
falls back to updated_at.

Revision ID: 0217
Revises: 0216
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0217"
down_revision = "0216"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("won_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE leads SET won_at = COALESCE(updated_at, created_at) "
        "WHERE status = 'won' AND won_at IS NULL"
    )

    op.add_column(
        "student_account_transactions",
        sa.Column("payment_format", sa.String(16), nullable=True),
    )

    op.add_column("students", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("students", sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE students SET archived_at = updated_at "
        "WHERE status = 'archived' AND archived_at IS NULL"
    )

    op.create_table(
        "academy_monthly_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("month", sa.Date(), nullable=False, unique=True, index=True),
        sa.Column("active_students", sa.Integer(), nullable=False),
        sa.Column("leads_created", sa.Integer(), nullable=False),
        sa.Column("won_leads", sa.Integer(), nullable=False),
        sa.Column("lead_conversion_pct", sa.Float(), nullable=False),
        sa.Column("payments_total", sa.Float(), nullable=False),
        sa.Column("payments_group", sa.Float(), nullable=False),
        sa.Column("payments_individual", sa.Float(), nullable=False),
        sa.Column("paying_students", sa.Integer(), nullable=False),
        sa.Column("payment_transactions", sa.Integer(), nullable=False),
        sa.Column("average_check", sa.Float(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("academy_monthly_snapshots")
    op.drop_column("students", "activated_at")
    op.drop_column("students", "archived_at")
    op.drop_column("student_account_transactions", "payment_format")
    op.drop_column("leads", "won_at")
