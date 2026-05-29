from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

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


class FinanceTargetResponse(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool


class FinanceArticleResponse(BaseModel):
    id: int
    name: str
    direction: str
    cost_kind: str
    scope: str
    is_active: bool


class FinanceArticleCreate(BaseModel):
    name: str
    direction: str
    scope: Optional[str] = "personal"
    cost_kind: Optional[str] = "none"


class FinanceArticleUpdate(BaseModel):
    name: Optional[str] = None
    direction: Optional[str] = None
    scope: Optional[str] = None
    cost_kind: Optional[str] = None
    is_active: Optional[bool] = None


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


class FinancePersonalOperationCreate(BaseModel):
    date: date
    amount: float
    description: str
    target_code: str = "personal"


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
