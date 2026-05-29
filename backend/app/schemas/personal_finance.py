from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class PersonalFinanceAccountResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    currency: str
    balance: float
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PersonalFinanceAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    currency: str = Field(default="RUB", min_length=3, max_length=8)


class PersonalFinanceAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    currency: Optional[str] = Field(None, min_length=3, max_length=8)
    is_active: Optional[bool] = None


class PersonalFinanceCategoryResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    direction: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PersonalFinanceCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    direction: Literal["income", "expense"]


class PersonalFinanceCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    direction: Optional[Literal["income", "expense"]] = None
    is_active: Optional[bool] = None


class PersonalFinanceRuleResponse(BaseModel):
    id: int
    owner_id: int
    pattern: str
    category_id: Optional[int] = None
    display_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    category: Optional[PersonalFinanceCategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class PersonalFinanceRuleCreate(BaseModel):
    pattern: str = Field(..., min_length=1, max_length=512)
    category_id: Optional[int] = None
    display_name: Optional[str] = Field(None, max_length=255)


class PersonalFinanceRuleUpdate(BaseModel):
    pattern: Optional[str] = Field(None, min_length=1, max_length=512)
    category_id: Optional[int] = None
    display_name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class PersonalFinanceTransactionResponse(BaseModel):
    id: int
    owner_id: int
    account_id: int
    category_id: Optional[int] = None
    amount: float
    direction: str
    article: Optional[str] = None
    description: Optional[str] = None
    occurred_at: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None
    account: Optional[PersonalFinanceAccountResponse] = None
    category: Optional[PersonalFinanceCategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class PersonalFinanceTransactionCreate(BaseModel):
    account_id: int
    amount: float
    direction: Literal["income", "expense"]
    article: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    occurred_at: datetime
    category_id: Optional[int] = None


class PersonalFinanceTransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    amount: Optional[float] = None
    direction: Optional[Literal["income", "expense"]] = None
    article: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    occurred_at: Optional[datetime] = None
    category_id: Optional[int] = None


class PersonalFinanceSummaryAccountItem(BaseModel):
    account_id: int
    account_name: str
    currency: str
    balance: float


class PersonalFinanceSummaryResponse(BaseModel):
    total_income: float
    total_expense: float
    net: float
    accounts: List[PersonalFinanceSummaryAccountItem]


class PersonalFinanceLegacyImportPayload(BaseModel):
    accounts: List[dict] = Field(default_factory=list)
    categories: List[dict] = Field(default_factory=list)
    rules: List[dict] = Field(default_factory=list)
    transactions: List[dict] = Field(default_factory=list)


class PersonalFinanceLegacyImportResponse(BaseModel):
    accounts_created: int
    categories_created: int
    rules_created: int
    transactions_created: int


__all__ = [name for name in globals() if not name.startswith("_")]
