"""
Use case: зачисление банковской операции на ученика (apply_bank_operation_to_student).

Домен: Finance.
Источник: BACKEND_REFACTOR_USE_CASES.md.
Создаёт проводку на счёт ученика, привязку телефона при no_match, обновляет даты на карточке.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import (
    BankTransaction,
    BankTransactionStatus,
    PhonePaymentBinding,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    TochkaAppliedPayment,
)
from app.utils.phone import normalize_phone
from app.services.student_card_period import update_card_payment_dates


@dataclass
class ApplyBankOperationResult:
    """Результат зачисления банковской операции на ученика."""
    transaction: BankTransaction


def apply_bank_operation_to_student(
    db: Session,
    transaction_id: int,
    student_id: int,
) -> ApplyBankOperationResult:
    """
    Зачисляет спорную банковскую операцию (no_match / ambiguous) на выбранного ученика.
    При наличии телефона плательщика создаёт привязку к родителю при отсутствии.
    Создаёт/обновляет StudentAccount, проводку, TochkaAppliedPayment, обновляет даты на карточке.

    Raises:
        ValueError: операция не найдена; уже зачислена; ученик не найден.
    """
    bt = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not bt:
        raise ValueError("Операция не найдена")
    if bt.status == BankTransactionStatus.APPLIED.value:
        raise ValueError("Операция уже зачислена")
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise ValueError("Ученик не найден")

    if bt.payer_phone and student.parent_id:
        normalized = normalize_phone(bt.payer_phone)
        if normalized:
            binding = db.query(PhonePaymentBinding).filter(
                PhonePaymentBinding.payer_phone_normalized == normalized
            ).first()
            if not binding:
                db.add(PhonePaymentBinding(
                    payer_phone_normalized=normalized,
                    parent_id=student.parent_id,
                ))

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

    note = f"Точка Банк, плательщик: {bt.payer_name or '—'}, дата: {bt.payment_date or '—'}"
    db.add(
        StudentAccountTransaction(
            account_id=account.id,
            amount=bt.amount,
            kind=StudentAccountTransactionKind.PAYMENT,
            note=note,
        )
    )
    account.balance += bt.amount
    db.add(
        TochkaAppliedPayment(
            tochka_account_id=bt.tochka_account_id or "",
            payment_date=bt.payment_date or "",
            amount=bt.amount,
            payer_name=(bt.payer_name or "")[:512],
            student_id=student_id,
            student_account_id=account.id,
        )
    )

    try:
        pay_date = (
            date.fromisoformat((bt.payment_date or "")[:10])
            if bt.payment_date
            else date.today()
        )
    except (ValueError, TypeError):
        pay_date = date.today()

    update_card_payment_dates(db, student_id, pay_date)

    bt.status = BankTransactionStatus.APPLIED.value
    bt.student_id = student_id
    bt.student_account_id = account.id
    db.commit()
    db.refresh(bt)
    return ApplyBankOperationResult(transaction=bt)
