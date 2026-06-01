"""Pydantic-схемы для Finance Hub (страница /finance, только owner)."""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Accounts (счета/кошельки)
# ---------------------------------------------------------------------------

class HubAccountCreate(BaseModel):
    name: str
    account_type: str = "other"      # bank|cash|crypto|other
    currency: str = "KZT"
    balance: float = 0.0
    project_id: Optional[int] = None  # NULL = личный счёт


class HubAccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    currency: Optional[str] = None
    balance: Optional[float] = None
    project_id: Optional[int] = None
    is_active: Optional[bool] = None


class HubAccountResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    account_type: str
    currency: str
    balance: float
    project_id: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Transactions (транзакции Finance Hub)
# ---------------------------------------------------------------------------

class HubTransactionCreate(BaseModel):
    account_id: int
    direction: str                  # income|expense
    category: str                   # project_revenue|salary|personal_income|etc.
    amount: float
    currency: str = "KZT"
    transaction_date: date
    description: Optional[str] = None
    project_id: Optional[int] = None  # finance_targets.id
    hub_status: str = "completed"   # completed|pending|planned

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v: str) -> str:
        if v not in ("income", "expense"):
            raise ValueError("direction must be 'income' or 'expense'")
        return v

    @field_validator("hub_status")
    @classmethod
    def validate_hub_status(cls, v: str) -> str:
        if v not in ("completed", "pending", "planned"):
            raise ValueError("hub_status must be 'completed', 'pending', or 'planned'")
        return v


class HubTransactionUpdate(BaseModel):
    direction: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    transaction_date: Optional[date] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    hub_status: Optional[str] = None


class HubTransactionResponse(BaseModel):
    id: int
    account_id: int
    direction: str
    category: Optional[str] = None
    amount: float
    currency: str
    transaction_date: Optional[date] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    hub_status: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HubTransactionByCategoryRow(BaseModel):
    category: str
    total: float
    count: int


class HubTransactionByProjectRow(BaseModel):
    project_id: Optional[int]
    project_name: str
    income: float
    expense: float
    net: float


# ---------------------------------------------------------------------------
# Debts (долги и обязательства)
# ---------------------------------------------------------------------------

class HubDebtCreate(BaseModel):
    debt_type: str                  # "owe" | "owed"
    counterparty: str
    amount: float
    currency: str = "KZT"
    due_date: Optional[date] = None
    description: Optional[str] = None
    project_id: Optional[int] = None

    @field_validator("debt_type")
    @classmethod
    def validate_debt_type(cls, v: str) -> str:
        if v not in ("owe", "owed"):
            raise ValueError("debt_type must be 'owe' or 'owed'")
        return v


class HubDebtUpdate(BaseModel):
    counterparty: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    due_date: Optional[date] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: Optional[str] = None


class HubDebtPaymentRequest(BaseModel):
    amount: float


class HubDebtResponse(BaseModel):
    id: int
    owner_id: int
    debt_type: str
    counterparty: str
    amount: float
    paid_amount: float
    debt_remaining: float
    currency: str
    due_date: Optional[date] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: str
    is_overdue: bool
    days_until_due: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Allocations (распределение средств)
# ---------------------------------------------------------------------------

class HubAllocationCreate(BaseModel):
    amount: float
    currency: str = "KZT"
    from_account_id: Optional[int] = None
    to_type: str                    # "project" | "personal"
    to_project_id: Optional[int] = None
    to_account_id: Optional[int] = None
    date: date
    comment: Optional[str] = None

    @field_validator("to_type")
    @classmethod
    def validate_to_type(cls, v: str) -> str:
        if v not in ("project", "personal"):
            raise ValueError("to_type must be 'project' or 'personal'")
        return v


class HubAllocationResponse(BaseModel):
    id: int
    owner_id: int
    amount: float
    currency: str
    from_account_id: Optional[int] = None
    from_account_name: Optional[str] = None
    to_type: str
    to_project_id: Optional[int] = None
    to_project_name: Optional[str] = None
    to_account_id: Optional[int] = None
    to_account_name: Optional[str] = None
    date: date
    comment: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Summary (сводка, Блок 1)
# ---------------------------------------------------------------------------

class HubSummaryResponse(BaseModel):
    date_from: date
    date_to: date
    total_balance: float            # сумма всех активных счетов
    period_income: float            # completed income за период
    period_expense: float           # completed expense за период
    net_flow: float                 # period_income - period_expense
    forecast_balance: float         # total_balance + planned_income - planned_expense


# ---------------------------------------------------------------------------
# Chart (данные для графика, Блок 1)
# ---------------------------------------------------------------------------

class HubChartPoint(BaseModel):
    period: str                     # "2025-04-01" или "2025-04" или "2025-W15"
    income: float
    expense: float


class HubChartResponse(BaseModel):
    group_by: str
    points: List[HubChartPoint]


# ---------------------------------------------------------------------------
# Forecast (прогноз баланса, Блок 7)
# ---------------------------------------------------------------------------

class HubForecastResponse(BaseModel):
    current_balance: float
    planned_income: float
    planned_expense: float
    forecast_balance: float
    planned_transactions: List[HubTransactionResponse]
