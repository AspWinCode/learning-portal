"""0093: personal finance db

Revision ID: 0093_personal_finance_db
Revises: 0092_parent_experience_foundation
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0093_personal_finance_db"
down_revision = "0092_parent_experience_foundation"
branch_labels = None
depends_on = None


personalfinancedirection = postgresql.ENUM(
    "income",
    "expense",
    name="personalfinancedirection",
    create_type=False,
)


def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = :table_name"
        ),
        {"table_name": table_name},
    ).scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    personalfinancedirection.create(conn, checkfirst=True)

    if not _table_exists(conn, "personal_finance_accounts"):
        op.create_table(
            "personal_finance_accounts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
            sa.Column("balance", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_personal_finance_accounts_owner_id", "personal_finance_accounts", ["owner_id"], unique=False)
        op.create_index("ix_personal_finance_accounts_name", "personal_finance_accounts", ["name"], unique=False)
        op.create_index("ix_personal_finance_accounts_is_active", "personal_finance_accounts", ["is_active"], unique=False)

    if not _table_exists(conn, "personal_finance_categories"):
        op.create_table(
            "personal_finance_categories",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("direction", personalfinancedirection, nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_personal_finance_categories_owner_id", "personal_finance_categories", ["owner_id"], unique=False)
        op.create_index("ix_personal_finance_categories_name", "personal_finance_categories", ["name"], unique=False)
        op.create_index("ix_personal_finance_categories_is_active", "personal_finance_categories", ["is_active"], unique=False)

    if not _table_exists(conn, "personal_finance_rules"):
        op.create_table(
            "personal_finance_rules",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("pattern", sa.String(length=512), nullable=False),
            sa.Column("category_id", sa.Integer(), nullable=True),
            sa.Column("display_name", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["category_id"], ["personal_finance_categories.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_personal_finance_rules_owner_id", "personal_finance_rules", ["owner_id"], unique=False)
        op.create_index("ix_personal_finance_rules_pattern", "personal_finance_rules", ["pattern"], unique=False)
        op.create_index("ix_personal_finance_rules_is_active", "personal_finance_rules", ["is_active"], unique=False)

    if not _table_exists(conn, "personal_finance_transactions"):
        op.create_table(
            "personal_finance_transactions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("account_id", sa.Integer(), nullable=False),
            sa.Column("category_id", sa.Integer(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("direction", personalfinancedirection, nullable=False),
            sa.Column("article", sa.String(length=255), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["account_id"], ["personal_finance_accounts.id"]),
            sa.ForeignKeyConstraint(["category_id"], ["personal_finance_categories.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_personal_finance_transactions_owner_id", "personal_finance_transactions", ["owner_id"], unique=False)
        op.create_index("ix_personal_finance_transactions_account_id", "personal_finance_transactions", ["account_id"], unique=False)
        op.create_index("ix_personal_finance_transactions_category_id", "personal_finance_transactions", ["category_id"], unique=False)
        op.create_index("ix_personal_finance_transactions_article", "personal_finance_transactions", ["article"], unique=False)
        op.create_index("ix_personal_finance_transactions_occurred_at", "personal_finance_transactions", ["occurred_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "personal_finance_transactions"):
        op.drop_index("ix_personal_finance_transactions_occurred_at", table_name="personal_finance_transactions")
        op.drop_index("ix_personal_finance_transactions_article", table_name="personal_finance_transactions")
        op.drop_index("ix_personal_finance_transactions_category_id", table_name="personal_finance_transactions")
        op.drop_index("ix_personal_finance_transactions_account_id", table_name="personal_finance_transactions")
        op.drop_index("ix_personal_finance_transactions_owner_id", table_name="personal_finance_transactions")
        op.drop_table("personal_finance_transactions")

    if _table_exists(conn, "personal_finance_rules"):
        op.drop_index("ix_personal_finance_rules_is_active", table_name="personal_finance_rules")
        op.drop_index("ix_personal_finance_rules_pattern", table_name="personal_finance_rules")
        op.drop_index("ix_personal_finance_rules_owner_id", table_name="personal_finance_rules")
        op.drop_table("personal_finance_rules")

    if _table_exists(conn, "personal_finance_categories"):
        op.drop_index("ix_personal_finance_categories_is_active", table_name="personal_finance_categories")
        op.drop_index("ix_personal_finance_categories_name", table_name="personal_finance_categories")
        op.drop_index("ix_personal_finance_categories_owner_id", table_name="personal_finance_categories")
        op.drop_table("personal_finance_categories")

    if _table_exists(conn, "personal_finance_accounts"):
        op.drop_index("ix_personal_finance_accounts_is_active", table_name="personal_finance_accounts")
        op.drop_index("ix_personal_finance_accounts_name", table_name="personal_finance_accounts")
        op.drop_index("ix_personal_finance_accounts_owner_id", table_name="personal_finance_accounts")
        op.drop_table("personal_finance_accounts")

    personalfinancedirection.drop(conn, checkfirst=True)
