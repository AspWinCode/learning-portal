"""Finance model templates: move from hardcoded dict to DB table.

Revision ID: 0124_finance_template_db
Revises: 0123_drop_legacy_finance_stacks
Create Date: 2026-06-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0124_finance_template_db"
down_revision = "0123_drop_legacy_finance_stacks"
branch_labels = None
depends_on = None

_SEED = [
    {
        "key": "blank",
        "name": "Пустая модель",
        "articles_json": [
            {"code": "income", "name": "Доходы", "direction": "income", "children": []},
            {"code": "expenses", "name": "Расходы", "direction": "expense", "children": []},
        ],
        "metrics_json": [],
        "is_system": True,
        "sort_order": 0,
    },
    {
        "key": "personal_budget",
        "name": "Личный бюджет",
        "articles_json": [
            {
                "code": "income",
                "name": "Доходы",
                "direction": "income",
                "children": [
                    {"code": "salary", "name": "Зарплата", "direction": "income"},
                    {"code": "side_income", "name": "Подработка", "direction": "income"},
                    {"code": "other_income", "name": "Прочие доходы", "direction": "income"},
                ],
            },
            {
                "code": "expenses",
                "name": "Расходы",
                "direction": "expense",
                "children": [
                    {"code": "housing", "name": "Жилье", "direction": "expense"},
                    {"code": "food", "name": "Питание", "direction": "expense"},
                    {"code": "transport", "name": "Транспорт", "direction": "expense"},
                    {"code": "health", "name": "Здоровье", "direction": "expense"},
                    {"code": "entertainment", "name": "Развлечения", "direction": "expense"},
                    {"code": "other_expenses", "name": "Прочие расходы", "direction": "expense"},
                ],
            },
        ],
        "metrics_json": [
            {"name": "Норма накоплений", "formula": "(SUM(income) - SUM(expenses)) / SUM(income) * 100", "unit": "%"},
        ],
        "is_system": True,
        "sort_order": 1,
    },
    {
        "key": "education_center",
        "name": "Учебный центр",
        "articles_json": [
            {
                "code": "revenue",
                "name": "Доходы",
                "direction": "income",
                "children": [
                    {"code": "subscriptions", "name": "Абонементы", "direction": "income"},
                    {"code": "single_lessons", "name": "Разовые занятия", "direction": "income"},
                ],
            },
            {
                "code": "costs",
                "name": "Расходы",
                "direction": "expense",
                "children": [
                    {"code": "rent", "name": "Аренда", "direction": "expense", "cost_kind": "fixed"},
                    {"code": "staff", "name": "Персонал", "direction": "expense", "cost_kind": "variable"},
                    {"code": "marketing", "name": "Маркетинг", "direction": "expense", "cost_kind": "variable"},
                    {"code": "materials", "name": "Расходные материалы", "direction": "expense", "cost_kind": "variable"},
                ],
            },
        ],
        "metrics_json": [
            {"name": "Маржа", "formula": "(SUM(revenue) - SUM(costs)) / SUM(revenue) * 100", "unit": "%"},
            {"name": "Средний чек", "formula": "SUM(revenue) / COUNT(revenue)", "unit": "RUB"},
        ],
        "is_system": True,
        "sort_order": 2,
    },
    {
        "key": "small_business",
        "name": "Малый бизнес",
        "articles_json": [
            {
                "code": "revenue",
                "name": "Доходы",
                "direction": "income",
                "children": [
                    {"code": "sales_revenue", "name": "Выручка от продаж", "direction": "income"},
                    {"code": "other_income", "name": "Прочие доходы", "direction": "income"},
                ],
            },
            {
                "code": "expenses",
                "name": "Расходы",
                "direction": "expense",
                "children": [
                    {"code": "cogs", "name": "Себестоимость", "direction": "expense", "cost_kind": "variable"},
                    {"code": "opex", "name": "Операционные расходы", "direction": "expense", "cost_kind": "fixed"},
                    {"code": "taxes", "name": "Налоги и сборы", "direction": "expense", "cost_kind": "fixed"},
                ],
            },
        ],
        "metrics_json": [
            {"name": "Gross Profit", "formula": "SUM(revenue) - SUM(cogs)", "unit": "RUB"},
            {"name": "EBITDA", "formula": "SUM(revenue) - SUM(cogs) - SUM(opex)", "unit": "RUB"},
        ],
        "is_system": True,
        "sort_order": 3,
    },
    {
        "key": "real_estate",
        "name": "Аренда недвижимости",
        "articles_json": [
            {"code": "rent_income", "name": "Арендные платежи", "direction": "income", "children": []},
            {
                "code": "property_expenses",
                "name": "Расходы",
                "direction": "expense",
                "children": [
                    {"code": "utilities", "name": "Коммунальные услуги", "direction": "expense"},
                    {"code": "maintenance", "name": "Обслуживание и ремонт", "direction": "expense"},
                    {"code": "taxes", "name": "Налоги", "direction": "expense"},
                    {"code": "mortgage", "name": "Ипотека / кредит", "direction": "expense"},
                ],
            },
        ],
        "metrics_json": [],
        "is_system": True,
        "sort_order": 4,
    },
]


def upgrade() -> None:
    tbl = op.create_table(
        "finance_model_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("articles_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("metrics_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_finance_model_templates_key"),
    )
    op.create_index("ix_finance_model_templates_id", "finance_model_templates", ["id"], unique=False)
    op.create_index("ix_finance_model_templates_key", "finance_model_templates", ["key"], unique=True)
    op.create_index("ix_finance_model_templates_sort_order", "finance_model_templates", ["sort_order"], unique=False)

    op.bulk_insert(tbl, _SEED)


def downgrade() -> None:
    op.drop_index("ix_finance_model_templates_sort_order", table_name="finance_model_templates")
    op.drop_index("ix_finance_model_templates_key", table_name="finance_model_templates")
    op.drop_index("ix_finance_model_templates_id", table_name="finance_model_templates")
    op.drop_table("finance_model_templates")
