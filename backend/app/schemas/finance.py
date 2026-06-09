from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.students import StudentAccountResponse


class BankPaymentItem(BaseModel):
    date: str
    amount: float
    payer_name: str


class BankPaymentImportRequest(BaseModel):
    payments: List[BankPaymentItem]


class BankPaymentImportResponse(BaseModel):
    applied: List[dict]
    no_match: List[dict]
    ambiguous: List[dict]


class TochkaImportRequest(BaseModel):
    date_from: str
    date_to: str
    account_id: Optional[str] = None


class PhonePaymentBindingCreate(BaseModel):
    payer_phone: str
    parent_id: int


class BankTransactionResponse(BaseModel):
    id: int
    operation_id: str
    amount: float
    payer_phone: Optional[str] = None
    payer_name: Optional[str] = None
    payment_date: Optional[str] = None
    status: str
    expense_category: Optional[str] = None
    student_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BankTransactionExpenseCategoryUpdate(BaseModel):
    expense_category: Optional[str] = None


class BankTransactionApplyRequest(BaseModel):
    student_id: int


class FinanceTransactionApplyStudentRequest(BaseModel):
    student_id: int


class FinanceLedgerBankRow(BaseModel):
    id: int
    occurred_at: Optional[datetime] = None
    amount: float
    direction: str
    status: str
    account_id: Optional[int] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    to_account_id: Optional[int] = None
    to_account_code: Optional[str] = None
    to_account_name: Optional[str] = None
    transfer_group_id: Optional[str] = None
    counterparty_name: Optional[str] = None
    counterparty_phone: Optional[str] = None
    bank_source: Optional[str] = None
    bank_operation_id: Optional[str] = None
    target_id: Optional[int] = None
    target_code: Optional[str] = None
    target_name: Optional[str] = None
    article_id: Optional[int] = None
    article_name: Optional[str] = None
    student_id: Optional[int] = None


class FinanceAccountResponse(BaseModel):
    id: int
    code: str
    name: str
    owner_scope: str
    is_active: bool


class FinanceAccountCreate(BaseModel):
    code: str
    name: str
    owner_scope: str = "business"


class FinanceTargetCreate(BaseModel):
    code: str
    name: str


class FinanceTargetResponse(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool


class FinanceArticleResponse(BaseModel):
    id: int
    code: Optional[str] = None
    target_id: Optional[int] = None
    parent_id: Optional[int] = None
    name: str
    direction: str
    cost_kind: str
    scope: str
    color: Optional[str] = None
    sort_order: int = 0
    is_active: bool


class FinanceArticleCreate(BaseModel):
    name: str
    direction: str
    code: Optional[str] = None
    target_id: Optional[int] = None
    parent_id: Optional[int] = None
    scope: Optional[str] = "personal"
    cost_kind: Optional[str] = "none"
    color: Optional[str] = None
    sort_order: int = 0


class FinanceArticleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    target_id: Optional[int] = None
    parent_id: Optional[int] = None
    direction: Optional[str] = None
    scope: Optional[str] = None
    cost_kind: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class FinanceArticleTreeItem(FinanceArticleResponse):
    children: List["FinanceArticleTreeItem"] = Field(default_factory=list)


class FinanceModelCreate(BaseModel):
    target_id: Optional[int] = None
    target_code: Optional[str] = None
    target_name: Optional[str] = None
    name: str
    template_key: str = "blank"
    currency: str = "RUB"
    period_type: str = "month"
    settings_json: Optional[Dict[str, Any]] = None


class FinanceModelUpdate(BaseModel):
    name: Optional[str] = None
    template_key: Optional[str] = None
    currency: Optional[str] = None
    period_type: Optional[str] = None
    settings_json: Optional[Dict[str, Any]] = None


class FinanceModelResponse(BaseModel):
    id: int
    target_id: int
    target_code: Optional[str] = None
    target_name: Optional[str] = None
    name: str
    template_key: str
    currency: str
    period_type: str
    settings_json: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FinanceTemplateArticleNode(BaseModel):
    code: str = ""
    name: str
    direction: str = "expense"
    cost_kind: Optional[str] = None
    color: Optional[str] = None
    children: Optional[List["FinanceTemplateArticleNode"]] = None

    model_config = ConfigDict(from_attributes=True)


FinanceTemplateArticleNode.model_rebuild()


class FinanceTemplateMetric(BaseModel):
    name: str
    formula: str
    unit: Optional[str] = None


class FinanceModelTemplateCreate(BaseModel):
    key: str
    name: str
    articles: List[FinanceTemplateArticleNode] = Field(default_factory=list)
    metrics: List[FinanceTemplateMetric] = Field(default_factory=list)


class FinanceModelTemplateUpdate(BaseModel):
    name: Optional[str] = None
    articles: Optional[List[FinanceTemplateArticleNode]] = None
    metrics: Optional[List[FinanceTemplateMetric]] = None


class FinanceModelTemplateResponse(BaseModel):
    id: int
    key: str
    name: str
    articles_json: List[Dict[str, Any]]
    metrics_json: List[Dict[str, Any]]
    is_system: bool
    sort_order: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetEntryUpsert(BaseModel):
    article_id: int
    amount_plan: float


class BudgetSaveRequest(BaseModel):
    target_id: int
    period: str
    entries: List[BudgetEntryUpsert]


class BudgetEntryResponse(BaseModel):
    id: int
    target_id: int
    article_id: int
    article_name: Optional[str] = None
    period: str
    amount_plan: float


class MetricDefinitionCreate(BaseModel):
    target_id: int
    name: str
    formula: str
    unit: Optional[str] = None
    goal_value: Optional[float] = None
    sort_order: int = 0


class MetricDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    formula: Optional[str] = None
    unit: Optional[str] = None
    goal_value: Optional[float] = None
    sort_order: Optional[int] = None


class MetricDefinitionResponse(BaseModel):
    id: int
    target_id: int
    target_name: Optional[str] = None
    name: str
    formula: str
    unit: Optional[str] = None
    goal_value: Optional[float] = None
    sort_order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MetricComputeResponse(BaseModel):
    metric_id: int
    name: str
    formula: str
    value: float
    unit: Optional[str] = None
    goal_value: Optional[float] = None
    period: Optional[str] = None


class DashboardWidgetCreate(BaseModel):
    metric_id: Optional[int] = None
    target_id: Optional[int] = None
    widget_type: str = "number"
    period_type: str = "current_month"
    position_x: int = 0
    position_y: int = 0
    width: int = 1
    title_override: Optional[str] = None


class DashboardWidgetUpdate(BaseModel):
    metric_id: Optional[int] = None
    target_id: Optional[int] = None
    widget_type: Optional[str] = None
    period_type: Optional[str] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    title_override: Optional[str] = None


class DashboardWidgetResponse(BaseModel):
    id: int
    owner_id: int
    metric_id: Optional[int] = None
    metric_name: Optional[str] = None
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    widget_type: str
    period_type: str
    position_x: int
    position_y: int
    width: int
    title_override: Optional[str] = None


class DashboardWidgetComputedResponse(DashboardWidgetResponse):
    value: Optional[float] = None
    unit: Optional[str] = None
    goal_value: Optional[float] = None


class FinanceTransactionUpdate(BaseModel):
    direction: Optional[str] = None
    status: Optional[str] = None
    account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    transfer_group_id: Optional[str] = None
    target_id: Optional[int] = None
    article_id: Optional[int] = None


class FinanceAccountBalance(BaseModel):
    account_id: int
    account_code: str
    account_name: str
    income_total: float
    expense_total: float
    balance: float


class FinancePnlRow(BaseModel):
    period: str
    income: float
    expense: float
    profit: float


class FinanceAnalyticsKpiBlock(BaseModel):
    income_total: float
    expense_total: float
    profit_total: float
    prev_income_total: float
    prev_expense_total: float
    prev_profit_total: float
    income_delta: float
    expense_delta: float
    profit_delta: float
    overdue_payments_3_count: int
    overdue_payments_10_count: int
    unclassified_transactions_count: int
    unclassified_transactions_amount: float


class FinanceAnalyticsTargetBreakdownRow(BaseModel):
    target_id: Optional[int] = None
    target_code: str
    target_name: str
    income: float
    expense: float
    profit: float


class FinanceAnalyticsExpenseBreakdownRow(BaseModel):
    article_id: Optional[int] = None
    article_name: str
    cost_kind: Optional[str] = None
    amount: float


class FinanceAnalyticsSummaryResponse(BaseModel):
    date_from: date
    date_to: date
    kpi: FinanceAnalyticsKpiBlock
    pnl: List[FinancePnlRow]
    target_breakdown: List[FinanceAnalyticsTargetBreakdownRow]
    expense_breakdown: List[FinanceAnalyticsExpenseBreakdownRow]
    account_balances: List[FinanceAccountBalance]


class FinanceLedgerTransactionRow(BaseModel):
    id: int
    occurred_at: Optional[datetime] = None
    amount: float
    direction: str
    target_code: Optional[str] = None
    target_name: Optional[str] = None
    article_id: Optional[int] = None
    article_name: Optional[str] = None
    counterparty_name: Optional[str] = None
    description_raw: Optional[str] = None


class FinanceManualTransactionCreate(BaseModel):
    account_id: int
    amount: float
    direction: str
    occurred_at: date
    article_id: Optional[int] = None
    target_id: Optional[int] = None
    description: Optional[str] = None


class FinanceStudentAccountCreate(BaseModel):
    student_id: int
    name: str


__all__ = [name for name in globals() if not name.startswith("_")]
