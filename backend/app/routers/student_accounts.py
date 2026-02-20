"""Счета учеников: пополнение и списание за занятия."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app import auth
from app.models import (
    User,
    UserRole,
    Student,
    StudentStatus,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    GroupStudent,
    Group,
)
from app.schemas import (
    StudentAccountResponse,
    StudentAccountUpdate,
    StudentAccountTransactionResponse,
    StudentAccountPaymentRequest,
    StudentAccountDeductRequest,
)
from app.routers.action_log import log_action

router = APIRouter()


def _can_access_student(db: Session, user: User, student_id: int) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        return True
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return False
    if user.role == UserRole.PARENT:
        return student.parent_id == user.id and student.status == StudentStatus.ACTIVE
    if user.role == UserRole.TRAINER:
        return db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == user.id,
        ).first() is not None
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
    account = db.query(StudentAccount).options(selectinload(StudentAccount.transactions)).filter(StudentAccount.id == account_id).first()
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
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    account = _get_account_and_check(db, account_id, current_user)
    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Название счета не может быть пустым")
        account.name = name
    db.commit()
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
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES) and current_user.role != UserRole.TRAINER:
        if current_user.role != UserRole.PARENT:
            raise HTTPException(status_code=403, detail="Только admin, owner, sales, тренер или родитель могут пополнять счет")
    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше 0")
    tx = StudentAccountTransaction(
        account_id=account_id,
        amount=amount,
        kind=StudentAccountTransactionKind.PAYMENT,
        note=payload.note,
    )
    db.add(tx)
    account.balance += amount
    db.commit()
    db.refresh(account)
    log_action(db, current_user.id, "student_account_payment", "student_account", account_id, {"amount": amount})
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
    if current_user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES, UserRole.TRAINER):
        raise HTTPException(status_code=403, detail="Списание доступно только admin, owner, sales или тренеру")
    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма списания должна быть больше 0")
    if account.balance < amount:
        raise HTTPException(status_code=400, detail="Недостаточно средств на счете")
    tx = StudentAccountTransaction(
        account_id=account_id,
        amount=-amount,
        kind=StudentAccountTransactionKind.LESSON_DEDUCTION,
        note=payload.note,
        lesson_attendance_id=payload.lesson_attendance_id,
    )
    db.add(tx)
    account.balance -= amount
    db.commit()
    db.refresh(account)
    log_action(db, current_user.id, "student_account_deduct", "student_account", account_id, {"amount": amount})
    return account


@router.get("/{account_id}/transactions", response_model=List[StudentAccountTransactionResponse])
async def list_account_transactions(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    account = _get_account_and_check(db, account_id, current_user)
    return account.transactions
