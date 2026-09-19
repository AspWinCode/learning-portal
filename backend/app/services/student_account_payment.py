"""
Общая логика Finance: зачисление платежа на счёт ученика.

Каноническое место для пополнения StudentAccount и пересчёта дат на карточке.
Используется: bank_operation (разнесение банковской операции), finance (apply-student по журналу).
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import (
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
)
from app.services.student_card_period import update_card_payment_dates


@dataclass
class AddPaymentResult:
    """Результат зачисления на счёт ученика."""
    account: StudentAccount
    transaction: StudentAccountTransaction


def add_payment_to_student_account(
    db: Session,
    student_id: int,
    amount: float,
    note: str,
    payment_date: date,
    finance_transaction_id: int | None = None,
) -> AddPaymentResult:
    """
    Зачисляет платёж на счёт ученика: получает/создаёт StudentAccount,
    создаёт проводку PAYMENT, обновляет баланс, обновляет даты на карточке (next_payment_date).
    Не выполняет commit — вызывающий код должен закоммитить транзакцию.

    Raises:
        ValueError: ученик не найден.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise ValueError("Ученик не найден")

    account = (
        db.query(StudentAccount)
        .filter(StudentAccount.student_id == student_id)
        .order_by(StudentAccount.id)
        .first()
    )
    if not account:
        account = StudentAccount(student_id=student_id, name="Основной", balance=0.0)
        db.add(account)
        db.flush()

    transaction = StudentAccountTransaction(
        account_id=account.id,
        amount=amount,
        kind=StudentAccountTransactionKind.PAYMENT,
        note=(note or "")[:512] if note else None,
        finance_transaction_id=finance_transaction_id,
    )
    db.add(transaction)
    account.balance += amount
    update_card_payment_dates(db, student_id, payment_date)
    return AddPaymentResult(account=account, transaction=transaction)
