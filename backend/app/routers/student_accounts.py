"""Student accounts: top-ups and lesson deductions."""

from datetime import date, datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app import auth
from app.database import db_transaction, get_db
from app.models import (
    FinanceAccount,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
    Group,
    GroupStudent,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentStatus,
    User,
    UserRole,
)
from app.routers.action_log import log_action
from app.schemas.students import (
    StudentAccountDeductRequest,
    StudentAccountPaymentRequest,
    StudentAccountResponse,
    StudentAccountTransactionResponse,
    StudentAccountUpdate,
)
from app.services.student_activity import log_student_activity

router = APIRouter()


def _student_accounts_effective_role(user: User) -> UserRole:
    return auth.resolve_effective_role(user)


def _can_access_student(db: Session, user: User, student_id: int) -> bool:
    effective_role = _student_accounts_effective_role(user)
    if effective_role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return True
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return False
    if effective_role == UserRole.PARENT:
        return student.parent_id == user.id and student.status == StudentStatus.ACTIVE
    if effective_role == UserRole.TRAINER:
        return (
            db.query(GroupStudent)
            .join(Group)
            .filter(
                GroupStudent.student_id == student_id,
                GroupStudent.left_at.is_(None),
                Group.trainer_id == user.id,
            )
            .first()
            is not None
        )
    return False


def _get_account_and_check(db: Session, account_id: int, current_user: User) -> StudentAccount:
    account = db.query(StudentAccount).filter(StudentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Счет не найден")
    if not _can_access_student(db, current_user, account.student_id):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return account


@router.get("/{account_id}", response_model=StudentAccountResponse)
async def get_student_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "student_accounts.access")
    account = (
        db.query(StudentAccount)
        .options(selectinload(StudentAccount.transactions))
        .filter(StudentAccount.id == account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Счет не найден")
    if not _can_access_student(db, current_user, account.student_id):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return account


@router.patch("/{account_id}", response_model=StudentAccountResponse)
async def update_student_account(
    account_id: int,
    payload: StudentAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("student_accounts.manage")),
):
    account = _get_account_and_check(db, account_id, current_user)
    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Название счета не может быть пустым")
        account.name = name
    with db_transaction(db):
        pass
    db.refresh(account)
    return account


@router.post("/{account_id}/payment", response_model=StudentAccountResponse)
async def add_payment(
    account_id: int,
    payload: StudentAccountPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Пополнение счета (оплата)."""
    account = _get_account_and_check(db, account_id, current_user)
    auth.ensure_permission(current_user, "student_accounts.payment")

    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше 0")

    discount_type = (payload.discount_type or "none").strip().lower()
    if discount_type not in {"none", "amount", "percent"}:
        raise HTTPException(status_code=400, detail="Invalid discount type")
    discount_value = float(payload.discount_value or 0.0)
    if discount_value < 0:
        raise HTTPException(status_code=400, detail="Discount cannot be negative")
    if discount_type == "percent" and discount_value > 100:
        raise HTTPException(status_code=400, detail="Discount percent cannot be greater than 100")
    if discount_type == "none":
        discount_value = 0.0

    finance_account = None
    if payload.finance_account_id is not None:
        finance_account = (
            db.query(FinanceAccount)
            .filter(FinanceAccount.id == payload.finance_account_id, FinanceAccount.is_active.is_(True))
            .first()
        )
        if not finance_account:
            raise HTTPException(status_code=400, detail="Finance account not found or inactive")

    tx = StudentAccountTransaction(
        account_id=account_id,
        amount=amount,
        kind=StudentAccountTransactionKind.PAYMENT,
        finance_account_id=payload.finance_account_id,
        discount_type=discount_type,
        discount_value=discount_value,
        note=payload.note,
    )
    finance_tx = None
    if finance_account:
        finance_tx = FinanceTransaction(
            occurred_at=datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc),
            amount=amount,
            direction=FinanceTransactionDirection.INCOME,
            account_id=finance_account.id,
            counterparty_name=account.student.full_name if account.student else None,
            description_raw=payload.note or f"Student account payment: {account.name}",
            bank_source="student_account",
            student_id=account.student_id,
            status=FinanceTransactionStatus.CLASSIFIED,
        )

    with db_transaction(db):
        if finance_tx:
            db.add(finance_tx)
            db.flush()
            tx.finance_transaction_id = finance_tx.id
        db.add(tx)
        account.balance += amount
        from app.services.student_card_period import update_card_payment_dates

        update_card_payment_dates(db, account.student_id, date.today())
        log_student_activity(
            db,
            student_id=account.student_id,
            activity_type="payment_received",
            title="Получена оплата",
            description=f"Сумма: {amount} ₽",
            created_by=current_user.id,
            payload_json={
                "account_id": account.id,
                "amount": amount,
                "note": payload.note,
                "finance_account_id": payload.finance_account_id,
                "finance_transaction_id": tx.finance_transaction_id,
                "discount_type": discount_type,
                "discount_value": discount_value,
            },
        )

    db.refresh(account)
    log_action(
        db,
        current_user.id,
        "student_account_payment",
        "student_account",
        account_id,
        {
            "amount": amount,
            "finance_account_id": payload.finance_account_id,
            "finance_transaction_id": tx.finance_transaction_id,
            "discount_type": discount_type,
            "discount_value": discount_value,
        },
    )
    return account


@router.post("/{account_id}/deduct", response_model=StudentAccountResponse)
async def deduct_lesson(
    account_id: int,
    payload: StudentAccountDeductRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Списание за занятие."""
    account = _get_account_and_check(db, account_id, current_user)
    auth.ensure_permission(current_user, "student_accounts.manage")

    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма списания должна быть больше 0")

    tx = StudentAccountTransaction(
        account_id=account_id,
        amount=-amount,
        kind=StudentAccountTransactionKind.LESSON_DEDUCTION,
        note=payload.note,
        lesson_attendance_id=payload.lesson_attendance_id,
    )

    with db_transaction(db):
        db.add(tx)
        account.balance -= amount

    db.refresh(account)
    log_action(db, current_user.id, "student_account_deduct", "student_account", account_id, {"amount": amount})
    return account


@router.get("/{account_id}/transactions", response_model=List[StudentAccountTransactionResponse])
async def list_account_transactions(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "student_accounts.access")
    account = _get_account_and_check(db, account_id, current_user)
    return account.transactions


@router.delete("/{account_id}/transactions/{transaction_id}", response_model=StudentAccountResponse)
async def delete_account_transaction(
    account_id: int,
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("student_accounts.manage")),
):
    """Удалить операцию по счёту ученика."""
    account = _get_account_and_check(db, account_id, current_user)
    tx = (
        db.query(StudentAccountTransaction)
        .filter(
            StudentAccountTransaction.id == transaction_id,
            StudentAccountTransaction.account_id == account_id,
        )
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Операция не найдена")

    kind = tx.kind
    finance_transaction_id = tx.finance_transaction_id
    with db_transaction(db):
        account.balance -= float(tx.amount or 0.0)
        if finance_transaction_id:
            finance_tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == finance_transaction_id).first()
            if finance_tx:
                db.delete(finance_tx)
        db.delete(tx)

        if kind == StudentAccountTransactionKind.PAYMENT:
            from app.services.student_card_period import update_card_payment_dates

            update_card_payment_dates(db, account.student_id, date.today())

    db.refresh(account)
    log_action(
        db,
        current_user.id,
        "student_account_transaction_delete",
        "student_account",
        account_id,
        {"transaction_id": transaction_id, "kind": kind.value},
    )
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("student_accounts.manage")),
):
    """Удалить счёт ученика, если по нему нет операций."""
    account = db.query(StudentAccount).filter(StudentAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Счет не найден")
    if account.transactions:
        raise HTTPException(status_code=400, detail="Нельзя удалить счет с операциями")
    if not _can_access_student(db, current_user, account.student_id):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    with db_transaction(db):
        db.delete(account)

    log_action(db, current_user.id, "delete", "student_account", account_id, {})
    return None
