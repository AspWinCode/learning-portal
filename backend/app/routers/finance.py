from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    User,
    UserRole,
    FinanceTransaction,
    FinanceAccount,
    FinanceTarget,
    FinanceArticle,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
)
from app.schemas import (
    FinanceLedgerBankRow,
    FinanceTransactionUpdate,
    FinanceAccountResponse,
    FinanceTargetResponse,
    FinanceArticleResponse,
)


router = APIRouter()


def _require_finance_access(user: User) -> None:
    """Права доступа к финансовому журналу: admin / owner / sales."""
    if user.role not in (UserRole.ADMIN, UserRole.OWNER, UserRole.SALES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для работы с финансовым журналом")


@router.get("/accounts", response_model=List[FinanceAccountResponse])
async def list_finance_accounts(
    only_active: bool = Query(True, description="Только активные счета"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceAccountResponse]:
    """Справочник счетов (банк/карта) для единого финансового журнала."""
    _require_finance_access(current_user)
    q = db.query(FinanceAccount)
    if only_active:
        q = q.filter(FinanceAccount.is_active.is_(True))
    accounts = q.order_by(FinanceAccount.code).all()
    return [
        FinanceAccountResponse(
            id=a.id,
            code=a.code,
            name=a.name,
            owner_scope=str(getattr(a.owner_scope, "value", a.owner_scope)),
            is_active=bool(a.is_active),
        )
        for a in accounts
    ]


@router.get("/targets", response_model=List[FinanceTargetResponse])
async def list_finance_targets(
    only_active: bool = Query(True, description="Только активные цели/проекты"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceTargetResponse]:
    """Справочник targets (academy, personal, leninets, gogol_mogol и т.п.)."""
    _require_finance_access(current_user)
    q = db.query(FinanceTarget)
    if only_active:
        q = q.filter(FinanceTarget.is_active.is_(True))
    targets = q.order_by(FinanceTarget.code).all()
    return [
        FinanceTargetResponse(
            id=t.id,
            code=t.code,
            name=t.name,
            is_active=bool(t.is_active),
        )
        for t in targets
    ]


@router.get("/articles", response_model=List[FinanceArticleResponse])
async def list_finance_articles(
    only_active: bool = Query(True, description="Только активные статьи"),
    scope: Optional[str] = Query(None, description="Фильтр по scope: academy | personal | any"),
    direction: Optional[str] = Query(None, description="Фильтр по direction: income | expense"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceArticleResponse]:
    """Единый справочник статей доходов/расходов."""
    _require_finance_access(current_user)
    q = db.query(FinanceArticle)
    if only_active:
        q = q.filter(FinanceArticle.is_active.is_(True))
    if scope:
        q = q.filter(FinanceArticle.scope == scope)
    if direction:
        q = q.filter(FinanceArticle.direction == direction)
    arts = q.order_by(FinanceArticle.name).all()
    return [
        FinanceArticleResponse(
            id=a.id,
            name=a.name,
            direction=str(getattr(a.direction, "value", a.direction)),
            cost_kind=str(getattr(a.cost_kind, "value", a.cost_kind)),
            scope=str(getattr(a.scope, "value", a.scope)),
            is_active=bool(a.is_active),
        )
        for a in arts
    ]


@router.get("/ledger/bank", response_model=List[FinanceLedgerBankRow])
async def list_finance_ledger_bank(
    status_filter: Optional[List[str]] = Query(
        None,
        description="Фильтр по статусу finance_transactions: new, classified, applied",
    ),
    unclassified_only: bool = Query(
        False,
        description="Только неразобранные операции (target_id IS NULL OR article_id IS NULL)",
    ),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerBankRow]:
    """
    Операции из единого финансового журнала, которые пришли из банков (bank_source не NULL),
    для использования на вкладке «Операции банка».
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .outerjoin(FinanceAccount, FinanceAccount.id == FinanceTransaction.account_id)
        .outerjoin(FinanceAccount, FinanceAccount.id == FinanceTransaction.to_account_id)
    )
    # Чтобы не путать алиасы, сделаем отдельные выборки ниже через joinedload
    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.bank_source.isnot(None))
        .order_by(FinanceTransaction.created_at.desc())
    )

    if status_filter:
        allowed = {s.value for s in FinanceTransactionStatus}  # type: ignore[attr-defined]
        invalid = [s for s in status_filter if s not in allowed]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный status: {', '.join(invalid)}",
            )
        q = q.filter(FinanceTransaction.status.in_(status_filter))

    if unclassified_only:
        q = q.filter(
            (FinanceTransaction.target_id.is_(None))
            | (FinanceTransaction.article_id.is_(None))
        )

    items: List[FinanceTransaction] = q.limit(limit).all()

    rows: List[FinanceLedgerBankRow] = []
    for tx in items:
        account: Optional[FinanceAccount] = getattr(tx, "account", None)
        to_account: Optional[FinanceAccount] = getattr(tx, "to_account", None)
        target: Optional[FinanceTarget] = getattr(tx, "target", None)
        article: Optional[FinanceArticle] = getattr(tx, "article", None)

        rows.append(
            FinanceLedgerBankRow(
                id=tx.id,
                occurred_at=tx.occurred_at,
                amount=tx.amount,
                direction=str(getattr(tx.direction, "value", tx.direction)),
                status=str(getattr(tx.status, "value", tx.status)),
                account_id=tx.account_id,
                account_code=getattr(account, "code", None),
                account_name=getattr(account, "name", None),
                to_account_id=tx.to_account_id,
                to_account_code=getattr(to_account, "code", None),
                to_account_name=getattr(to_account, "name", None),
                counterparty_name=tx.counterparty_name,
                counterparty_phone=tx.counterparty_phone,
                bank_source=tx.bank_source,
                bank_operation_id=tx.bank_operation_id,
                target_id=tx.target_id,
                target_code=getattr(target, "code", None),
                target_name=getattr(target, "name", None),
                article_id=tx.article_id,
                article_name=getattr(article, "name", None),
                student_id=tx.student_id,
            )
        )
    return rows


@router.patch("/transactions/{transaction_id}", response_model=FinanceLedgerBankRow)
async def update_finance_transaction(
    transaction_id: int,
    payload: FinanceTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Частичное обновление транзакции журнала (смена направления, target/article, счетов, статуса).
    Используется для ручной классификации во фронтенде.
    """
    _require_finance_access(current_user)

    tx = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.id == transaction_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Транзакция не найдена")

    if payload.direction is not None:
        if payload.direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        tx.direction = FinanceTransactionDirection(payload.direction)  # type: ignore[call-arg]

    if payload.status is not None:
        if payload.status not in {s.value for s in FinanceTransactionStatus}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение status")
        tx.status = FinanceTransactionStatus(payload.status)  # type: ignore[call-arg]

    if payload.account_id is not None:
        if payload.account_id and not db.query(FinanceAccount.id).filter(FinanceAccount.id == payload.account_id).first():
            raise HTTPException(status_code=400, detail="account_id не найден")
        tx.account_id = payload.account_id

    if payload.to_account_id is not None:
        if payload.to_account_id and not db.query(FinanceAccount.id).filter(FinanceAccount.id == payload.to_account_id).first():
            raise HTTPException(status_code=400, detail="to_account_id не найден")
        tx.to_account_id = payload.to_account_id

    if payload.target_id is not None:
        if payload.target_id and not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
            raise HTTPException(status_code=400, detail="target_id не найден")
        tx.target_id = payload.target_id

    if payload.article_id is not None:
        if payload.article_id and not db.query(FinanceArticle.id).filter(FinanceArticle.id == payload.article_id).first():
            raise HTTPException(status_code=400, detail="article_id не найден")
        tx.article_id = payload.article_id

    db.commit()
    db.refresh(tx)

    account: Optional[FinanceAccount] = getattr(tx, "account", None)
    to_account: Optional[FinanceAccount] = getattr(tx, "to_account", None)
    target: Optional[FinanceTarget] = getattr(tx, "target", None)
    article: Optional[FinanceArticle] = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=tx.amount,
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account, "code", None),
        account_name=getattr(account, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account, "code", None),
        to_account_name=getattr(to_account, "name", None),
        counterparty_name=tx.counterparty_name,
        counterparty_phone=tx.counterparty_phone,
        bank_source=tx.bank_source,
        bank_operation_id=tx.bank_operation_id,
        target_id=tx.target_id,
        target_code=getattr(target, "code", None),
        target_name=getattr(target, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article, "name", None),
        student_id=tx.student_id,
    )

