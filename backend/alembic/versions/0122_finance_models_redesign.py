"""finance models redesign

Revision ID: 0122_finance_models_redesign
Revises: 0121_password_entries
Create Date: 2026-06-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0122_finance_models_redesign"
down_revision = "0121_password_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("finance_articles", sa.Column("code", sa.String(length=96), nullable=True))
    op.add_column("finance_articles", sa.Column("target_id", sa.Integer(), nullable=True))
    op.add_column("finance_articles", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.add_column("finance_articles", sa.Column("color", sa.String(length=16), nullable=True))
    op.add_column("finance_articles", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.create_foreign_key(
        "fk_finance_articles_target_id",
        "finance_articles",
        "finance_targets",
        ["target_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_finance_articles_parent_id",
        "finance_articles",
        "finance_articles",
        ["parent_id"],
        ["id"],
    )
    op.create_index(op.f("ix_finance_articles_code"), "finance_articles", ["code"], unique=False)
    op.create_index(op.f("ix_finance_articles_target_id"), "finance_articles", ["target_id"], unique=False)
    op.create_index(op.f("ix_finance_articles_parent_id"), "finance_articles", ["parent_id"], unique=False)
    op.create_index(op.f("ix_finance_articles_sort_order"), "finance_articles", ["sort_order"], unique=False)

    op.create_table(
        "finance_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("template_key", sa.String(length=64), nullable=False, server_default="blank"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
        sa.Column("period_type", sa.String(length=32), nullable=False, server_default="month"),
        sa.Column("settings_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["target_id"], ["finance_targets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("target_id", "name", name="uq_finance_models_target_name"),
    )
    op.create_index(op.f("ix_finance_models_id"), "finance_models", ["id"], unique=False)
    op.create_index(op.f("ix_finance_models_target_id"), "finance_models", ["target_id"], unique=False)
    op.create_index(op.f("ix_finance_models_template_key"), "finance_models", ["template_key"], unique=False)
    op.create_index(op.f("ix_finance_models_created_at"), "finance_models", ["created_at"], unique=False)

    op.create_table(
        "budget_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("article_id", sa.Integer(), nullable=False),
        sa.Column("period", sa.String(length=7), nullable=False),
        sa.Column("amount_plan", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["article_id"], ["finance_articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["finance_targets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("target_id", "article_id", "period", name="uq_budget_entries_target_article_period"),
    )
    op.create_index(op.f("ix_budget_entries_id"), "budget_entries", ["id"], unique=False)
    op.create_index(op.f("ix_budget_entries_target_id"), "budget_entries", ["target_id"], unique=False)
    op.create_index(op.f("ix_budget_entries_article_id"), "budget_entries", ["article_id"], unique=False)
    op.create_index(op.f("ix_budget_entries_period"), "budget_entries", ["period"], unique=False)
    op.create_index(op.f("ix_budget_entries_created_at"), "budget_entries", ["created_at"], unique=False)

    op.create_table(
        "metric_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("formula", sa.Text(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("goal_value", sa.Float(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["target_id"], ["finance_targets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_metric_definitions_id"), "metric_definitions", ["id"], unique=False)
    op.create_index(op.f("ix_metric_definitions_target_id"), "metric_definitions", ["target_id"], unique=False)
    op.create_index(op.f("ix_metric_definitions_sort_order"), "metric_definitions", ["sort_order"], unique=False)
    op.create_index(op.f("ix_metric_definitions_created_at"), "metric_definitions", ["created_at"], unique=False)

    op.create_table(
        "dashboard_widgets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("metric_id", sa.Integer(), nullable=True),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("widget_type", sa.String(length=32), nullable=False, server_default="number"),
        sa.Column("period_type", sa.String(length=32), nullable=False, server_default="current_month"),
        sa.Column("position_x", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("position_y", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title_override", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["metric_id"], ["metric_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["finance_targets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dashboard_widgets_id"), "dashboard_widgets", ["id"], unique=False)
    op.create_index(op.f("ix_dashboard_widgets_owner_id"), "dashboard_widgets", ["owner_id"], unique=False)
    op.create_index(op.f("ix_dashboard_widgets_metric_id"), "dashboard_widgets", ["metric_id"], unique=False)
    op.create_index(op.f("ix_dashboard_widgets_target_id"), "dashboard_widgets", ["target_id"], unique=False)
    op.create_index(op.f("ix_dashboard_widgets_created_at"), "dashboard_widgets", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_dashboard_widgets_created_at"), table_name="dashboard_widgets")
    op.drop_index(op.f("ix_dashboard_widgets_target_id"), table_name="dashboard_widgets")
    op.drop_index(op.f("ix_dashboard_widgets_metric_id"), table_name="dashboard_widgets")
    op.drop_index(op.f("ix_dashboard_widgets_owner_id"), table_name="dashboard_widgets")
    op.drop_index(op.f("ix_dashboard_widgets_id"), table_name="dashboard_widgets")
    op.drop_table("dashboard_widgets")

    op.drop_index(op.f("ix_metric_definitions_created_at"), table_name="metric_definitions")
    op.drop_index(op.f("ix_metric_definitions_sort_order"), table_name="metric_definitions")
    op.drop_index(op.f("ix_metric_definitions_target_id"), table_name="metric_definitions")
    op.drop_index(op.f("ix_metric_definitions_id"), table_name="metric_definitions")
    op.drop_table("metric_definitions")

    op.drop_index(op.f("ix_budget_entries_created_at"), table_name="budget_entries")
    op.drop_index(op.f("ix_budget_entries_period"), table_name="budget_entries")
    op.drop_index(op.f("ix_budget_entries_article_id"), table_name="budget_entries")
    op.drop_index(op.f("ix_budget_entries_target_id"), table_name="budget_entries")
    op.drop_index(op.f("ix_budget_entries_id"), table_name="budget_entries")
    op.drop_table("budget_entries")

    op.drop_index(op.f("ix_finance_models_created_at"), table_name="finance_models")
    op.drop_index(op.f("ix_finance_models_template_key"), table_name="finance_models")
    op.drop_index(op.f("ix_finance_models_target_id"), table_name="finance_models")
    op.drop_index(op.f("ix_finance_models_id"), table_name="finance_models")
    op.drop_table("finance_models")

    op.drop_index(op.f("ix_finance_articles_sort_order"), table_name="finance_articles")
    op.drop_index(op.f("ix_finance_articles_parent_id"), table_name="finance_articles")
    op.drop_index(op.f("ix_finance_articles_target_id"), table_name="finance_articles")
    op.drop_index(op.f("ix_finance_articles_code"), table_name="finance_articles")
    op.drop_constraint("fk_finance_articles_parent_id", "finance_articles", type_="foreignkey")
    op.drop_constraint("fk_finance_articles_target_id", "finance_articles", type_="foreignkey")
    op.drop_column("finance_articles", "sort_order")
    op.drop_column("finance_articles", "color")
    op.drop_column("finance_articles", "parent_id")
    op.drop_column("finance_articles", "target_id")
    op.drop_column("finance_articles", "code")

