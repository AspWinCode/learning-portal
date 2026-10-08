from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class PaymentDetail(BaseModel):
    transaction_id: int
    account_id: int
    date: Optional[date] = None
    amount: float
    finance_transaction_id: Optional[int] = None
    payment_format: Optional[str] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True


class DuplicatePaymentGroupResponse(BaseModel):
    finance_transaction_id: int
    student_id: Optional[int] = None
    transactions: List[PaymentDetail]

    class Config:
        from_attributes = True


class StudentPaymentAuditEntry(BaseModel):
    student_id: int
    student_name: str
    status: str
    on_grant: bool

    learning_format: str
    abonement_id: Optional[int] = None
    abonement_name: Optional[str] = None
    active_group_names: List[str] = []

    payment_count: int
    payment_total: float
    first_payment_date: Optional[date] = None
    last_payment_date: Optional[date] = None
    payments: List[PaymentDetail] = []

    learning_period_start: Optional[date] = None
    period_state: str
    lessons_passed: Optional[int] = None
    lessons_attended: Optional[int] = None
    lessons_missed: Optional[int] = None
    lessons_remaining: Optional[int] = None
    lifetime_lessons_count: Optional[int] = None

    lifetime_lessons_passed: Optional[int] = None
    current_period_lessons: Optional[int] = None

    period_should_rollover: bool = False
    data_warning: Optional[str] = None
    warnings: List[str] = []
    possible_duplicate: bool = False
    duplicate_student_ids: List[int] = []

    class Config:
        from_attributes = True


class StudentPaymentAuditSummaryResponse(BaseModel):
    students_total: int
    with_payments: int
    without_payments: int
    grant_students: int

    class Config:
        from_attributes = True


class StudentPaymentAuditResponse(BaseModel):
    summary: StudentPaymentAuditSummaryResponse
    students: List[StudentPaymentAuditEntry]
    possible_duplicate_payments: List[DuplicatePaymentGroupResponse]
    danilova_daria: List[StudentPaymentAuditEntry] = []

    class Config:
        from_attributes = True
