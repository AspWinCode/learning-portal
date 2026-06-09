from typing import Dict, List, Optional


ArticleTemplate = Dict[str, object]


TEMPLATES: Dict[str, Dict[str, object]] = {
    "blank": {
        "name": "Пустая модель",
        "articles": [
            {"code": "income", "name": "Доходы", "direction": "income", "children": []},
            {"code": "expenses", "name": "Расходы", "direction": "expense", "children": []},
        ],
        "metrics": [],
    },
    "personal_budget": {
        "name": "Личный бюджет",
        "articles": [
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
        "metrics": [
            {"name": "Норма накоплений", "formula": "(SUM(income) - SUM(expenses)) / SUM(income) * 100", "unit": "%"},
        ],
    },
    "education_center": {
        "name": "Учебный центр",
        "articles": [
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
        "metrics": [
            {"name": "Маржа", "formula": "(SUM(revenue) - SUM(costs)) / SUM(revenue) * 100", "unit": "%"},
            {"name": "Средний чек", "formula": "SUM(revenue) / COUNT(revenue)", "unit": "RUB"},
        ],
    },
    "small_business": {
        "name": "Малый бизнес",
        "articles": [
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
        "metrics": [
            {"name": "Gross Profit", "formula": "SUM(revenue) - SUM(cogs)", "unit": "RUB"},
            {"name": "EBITDA", "formula": "SUM(revenue) - SUM(cogs) - SUM(opex)", "unit": "RUB"},
        ],
    },
    "real_estate": {
        "name": "Аренда недвижимости",
        "articles": [
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
        "metrics": [],
    },
}


def get_template(template_key: Optional[str]) -> Dict[str, object]:
    return TEMPLATES.get(template_key or "blank", TEMPLATES["blank"])


def list_templates() -> List[Dict[str, str]]:
    return [{"key": key, "name": str(value["name"])} for key, value in TEMPLATES.items()]

