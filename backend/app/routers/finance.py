from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel
import csv
import hashlib
from datetime import date, datetime
from io import StringIO, BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
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
    FinanceArticleDirection,
    FinanceArticleCostKind,
    FinanceArticleScope,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
    FinanceRecognitionRule,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
)
from app.schemas import (
    FinanceLedgerBankRow,
    FinanceLedgerTransactionRow,
    FinancePersonalOperationCreate,
    FinanceManualTransactionCreate,
    FinanceTransactionUpdate,
    FinanceAccountResponse,
    FinanceTargetResponse,
    FinanceArticleResponse,
    FinanceArticleCreate,
    FinanceArticleUpdate,
    FinanceAccountBalance,
    FinancePnlRow,
    FinanceTransactionApplyStudentRequest,
    BankTransactionResponse,
    BankTransactionApplyRequest,
    StudentAccountResponse,
)
from app.services.finance_ledger import apply_recognition_rules
from app.services.student_account_finance import create_student_account as finance_create_student_account
from app.services.bank_operation import apply_bank_operation_to_student as bank_operation_apply
from app.dependencies import require_finance_access as dep_require_finance_access


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


@router.post("/articles", response_model=FinanceArticleResponse)
async def create_finance_article(
    payload: FinanceArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceArticleResponse:
    """Создание статьи дохода/расхода в едином справочнике."""
    _require_finance_access(current_user)

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    direction_value = payload.direction
    if direction_value not in {d.value for d in FinanceArticleDirection}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение direction")
    direction = FinanceArticleDirection(direction_value)  # type: ignore[call-arg]

    scope_value = payload.scope or "personal"
    if scope_value not in {s.value for s in FinanceArticleScope}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение scope")
    scope = FinanceArticleScope(scope_value)  # type: ignore[call-arg]

    cost_kind_value = payload.cost_kind or "none"
    if cost_kind_value not in {c.value for c in FinanceArticleCostKind}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение cost_kind")
    cost_kind = FinanceArticleCostKind(cost_kind_value)  # type: ignore[call-arg]

    art = FinanceArticle(
        name=name,
        direction=direction,
        cost_kind=cost_kind,
        scope=scope,
        is_active=True,
    )
    db.add(art)
    db.commit()
    db.refresh(art)

    return FinanceArticleResponse(
        id=art.id,
        name=art.name,
        direction=str(getattr(art.direction, "value", art.direction)),
        cost_kind=str(getattr(art.cost_kind, "value", art.cost_kind)),
        scope=str(getattr(art.scope, "value", art.scope)),
        is_active=bool(art.is_active),
    )


@router.patch("/articles/{article_id}", response_model=FinanceArticleResponse)
async def update_finance_article(
    article_id: int,
    payload: FinanceArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceArticleResponse:
    """Частичное обновление статьи (переименование, смена типа, деактивация)."""
    _require_finance_access(current_user)

    art = db.query(FinanceArticle).filter(FinanceArticle.id == article_id).first()
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    if payload.name is not None:
        art.name = payload.name.strip() or art.name

    if payload.direction is not None:
        if payload.direction not in {d.value for d in FinanceArticleDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        art.direction = FinanceArticleDirection(payload.direction)  # type: ignore[call-arg]

    if payload.scope is not None:
        if payload.scope not in {s.value for s in FinanceArticleScope}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение scope")
        art.scope = FinanceArticleScope(payload.scope)  # type: ignore[call-arg]

    if payload.cost_kind is not None:
        if payload.cost_kind not in {c.value for c in FinanceArticleCostKind}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение cost_kind")
        art.cost_kind = FinanceArticleCostKind(payload.cost_kind)  # type: ignore[call-arg]

    if payload.is_active is not None:
        art.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(art)

    return FinanceArticleResponse(
        id=art.id,
        name=art.name,
        direction=str(getattr(art.direction, "value", art.direction)),
        cost_kind=str(getattr(art.cost_kind, "value", art.cost_kind)),
        scope=str(getattr(art.scope, "value", art.scope)),
        is_active=bool(art.is_active),
    )


@router.delete("/articles/{article_id}")
async def delete_finance_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """
    Удаление статьи.
    По умолчанию делаем мягкое удаление (is_active = False),
    чтобы не ломать ссылки из существующих транзакций.
    """
    _require_finance_access(current_user)

    art = db.query(FinanceArticle).filter(FinanceArticle.id == article_id).first()
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    art.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/ledger/transactions", response_model=List[FinanceLedgerTransactionRow])
async def list_finance_ledger_transactions(
    target_codes: Optional[List[str]] = Query(
        None,
        description="Фильтр по кодам target (personal, leninets, gogol_mogol, academy). Пусто = все эти цели.",
    ),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    limit: int = Query(5000, ge=1, le=50000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerTransactionRow]:
    """
    Список транзакций единого журнала для дашборда личных финансов.
    По умолчанию возвращаются операции с любым target (personal, leninets, gogol_mogol, academy).
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(
            FinanceTransaction.direction.in_(
                [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
            )
        )
    )

    if target_codes:
        targets = db.query(FinanceTarget.id).filter(FinanceTarget.code.in_(target_codes)).all()
        target_ids = [t[0] for t in targets]
        if target_ids:
            q = q.filter(FinanceTransaction.target_id.in_(target_ids))
        else:
            return []
    else:
        # по умолчанию — только «личные» цели (для дашборда)
        default_codes = ["personal", "leninets", "gogol_mogol", "academy"]
        targets = db.query(FinanceTarget.id).filter(FinanceTarget.code.in_(default_codes)).all()
        target_ids = [t[0] for t in targets]
        if target_ids:
            q = q.filter(FinanceTransaction.target_id.in_(target_ids))
        else:
            return []

    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    q = q.order_by(FinanceTransaction.occurred_at.desc())
    items: List[FinanceTransaction] = q.limit(limit).all()

    rows: List[FinanceLedgerTransactionRow] = []
    for tx in items:
        target = getattr(tx, "target", None)
        article = getattr(tx, "article", None)
        rows.append(
            FinanceLedgerTransactionRow(
                id=tx.id,
                occurred_at=tx.occurred_at,
                amount=float(tx.amount or 0.0),
                direction=str(getattr(tx.direction, "value", tx.direction)),
                target_code=getattr(target, "code", None) if target else None,
                target_name=getattr(target, "name", None) if target else None,
                article_id=tx.article_id,
                article_name=getattr(article, "name", None) if article else None,
                counterparty_name=tx.counterparty_name,
                description_raw=tx.description_raw,
            )
        )
    return rows


@router.get("/balances", response_model=List[FinanceAccountBalance])
async def get_finance_account_balances(
    as_of: Optional[date] = Query(None, description="Дата, на которую считать остатки (по occurred_at <= as_of)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceAccountBalance]:
    """
    Остатки по счетам (finance_accounts) на указанную дату с оборотами доходов/расходов.
    Transfer-операции учитываются как перевод между своими счетами и не попадают в обороты.
    """
    _require_finance_access(current_user)

    # Базовый набор счетов
    accounts = db.query(FinanceAccount).filter(FinanceAccount.is_active.is_(True)).all()
    balance_map: Dict[int, Dict[str, float]] = {}
    for acc in accounts:
        balance_map[acc.id] = {
            "income": 0.0,
            "expense": 0.0,
            "balance": 0.0,
        }

    # Все транзакции до указанной даты
    q = db.query(FinanceTransaction)
    if as_of is not None:
        q = q.filter(FinanceTransaction.occurred_at <= as_of)
    txs: List[FinanceTransaction] = q.all()

    for tx in txs:
        # Доход / расход: учитываем только по account_id
        if tx.direction == FinanceTransactionDirection.INCOME:
            if tx.account_id and tx.account_id in balance_map:
                balance_map[tx.account_id]["income"] += float(tx.amount or 0.0)
                balance_map[tx.account_id]["balance"] += float(tx.amount or 0.0)
        elif tx.direction == FinanceTransactionDirection.EXPENSE:
            if tx.account_id and tx.account_id in balance_map:
                amt = float(tx.amount or 0.0)
                # amount для расхода может быть отрицательным; расход считаем по модулю
                balance_map[tx.account_id]["expense"] += abs(amt)
                balance_map[tx.account_id]["balance"] += amt
        elif tx.direction == FinanceTransactionDirection.TRANSFER:
            # Перевод между своими счетами: не считаем в доход/расход, только в балансах
            amt = abs(float(tx.amount or 0.0))
            if tx.account_id and tx.account_id in balance_map:
                balance_map[tx.account_id]["balance"] -= amt
            if tx.to_account_id and tx.to_account_id in balance_map:
                balance_map[tx.to_account_id]["balance"] += amt

    result: List[FinanceAccountBalance] = []
    for acc in accounts:
        data = balance_map.get(acc.id) or {"income": 0.0, "expense": 0.0, "balance": 0.0}
        result.append(
            FinanceAccountBalance(
                account_id=acc.id,
                account_code=acc.code,
                account_name=acc.name,
                income_total=round(data["income"], 2),
                expense_total=round(data["expense"], 2),
                balance=round(data["balance"], 2),
            )
        )
    # Сортируем по коду счета для стабильного вывода
    result.sort(key=lambda x: x.account_code)
    return result


@router.get("/pnl", response_model=List[FinancePnlRow])
async def get_finance_pnl(
    target_code: str = Query("academy", description="Код проекта/кошелька (finance_targets.code)"),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    group_by: str = Query("month", description="Группировка: 'month' или 'date'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinancePnlRow]:
    """
    P&L по операциям журнала для выбранного проекта (target).
    Учитываются только direction = income/expense; transfer-операции исключаются.
    """
    _require_finance_access(current_user)

    target = db.query(FinanceTarget).filter(FinanceTarget.code == target_code).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target с таким кодом не найден")

    q = db.query(FinanceTransaction).filter(
        FinanceTransaction.target_id == target.id,
        FinanceTransaction.direction.in_(
            [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
        ),
    )
    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= date_from)
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= date_to)

    txs: List[FinanceTransaction] = q.all()

    buckets: Dict[str, Dict[str, float]] = {}
    for tx in txs:
        if not tx.occurred_at:
            continue
        if group_by == "date":
            key = tx.occurred_at.date().isoformat()
        else:
            # month: YYYY-MM
            key = f"{tx.occurred_at.year:04d}-{tx.occurred_at.month:02d}"

        if key not in buckets:
            buckets[key] = {"income": 0.0, "expense": 0.0}

        amt = float(tx.amount or 0.0)
        if tx.direction == FinanceTransactionDirection.INCOME:
            buckets[key]["income"] += amt
        elif tx.direction == FinanceTransactionDirection.EXPENSE:
            buckets[key]["expense"] += abs(amt)

    rows: List[FinancePnlRow] = []
    for key in sorted(buckets.keys()):
        income = buckets[key]["income"]
        expense = buckets[key]["expense"]
        rows.append(
            FinancePnlRow(
                period=key,
                income=round(income, 2),
                expense=round(expense, 2),
                profit=round(income - expense, 2),
            )
        )
    return rows


@router.post("/import")
async def import_finance_transactions(
    account_code: str = Form(..., description="Код счёта (finance_accounts.code)"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, int]:
    """
    Импорт операций из CSV/XLSX напрямую в единый финансовый журнал.

    Минимальный CSV-формат: колонки
      date,amount,counterparty,description,bank_operation_id(optional)
    """
    _require_finance_access(current_user)

    account = db.query(FinanceAccount).filter(FinanceAccount.code == account_code).first()
    if not account:
        raise HTTPException(status_code=400, detail="account_code не найден в finance_accounts")

    filename = (file.filename or "").lower()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    created = 0
    skipped = 0

    def _upsert_row(
        date_str: str,
        amount_val: float,
        counterparty: str,
        description: str,
        bank_operation_id: Optional[str],
        bank_source: str,
    ) -> None:
        nonlocal created, skipped
        if not date_str or not amount_val:
            skipped += 1
            return
        # Нормализуем строку даты: поддерживаем "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS" и т.п.
        try:
            ds = date_str.strip()
            # Если дата пришла как "2026-03-09 00:00:00" (из Excel), берём только часть до пробела
            if " " in ds and "T" not in ds:
                ds = ds.split(" ")[0]
            occurred_at = datetime.fromisoformat(ds + "T12:00:00")
        except Exception:
            skipped += 1
            return

        direction = "income" if amount_val > 0 else "expense"
        # v2: версионированный dedup_seed, чтобы избежать конфликтов со старыми импортами
        dedup_seed = f"v2|{bank_source}|{date_str}|{amount_val}|{counterparty.strip()}|{description.strip()}"
        dedup_hash = hashlib.sha1(dedup_seed.encode("utf-8")).hexdigest()

        # Проверка на дубликат.
        # Если есть bank_operation_id — считаем дубликатом по нему.
        # Если operation_id отсутствует — используем dedup_hash.
        if bank_operation_id:
            existing = (
                db.query(FinanceTransaction.id)
                .filter(
                    FinanceTransaction.bank_source == bank_source,
                    FinanceTransaction.bank_operation_id == bank_operation_id,
                )
                .first()
            )
        else:
            existing = (
                db.query(FinanceTransaction.id)
                .filter(
                    FinanceTransaction.bank_source == bank_source,
                    FinanceTransaction.dedup_hash == dedup_hash,
                )
                .first()
            )
        if existing:
            skipped += 1
            return

        tx = FinanceTransaction(
            occurred_at=occurred_at,
            amount=amount_val,
            direction=direction,
            account_id=account.id,
            to_account_id=None,
            transfer_group_id=None,
            counterparty_name=counterparty.strip() or None,
            counterparty_phone=None,
            description_raw=description.strip() or None,
            bank_source=bank_source,
            bank_operation_id=bank_operation_id,
            dedup_hash=dedup_hash,
            target_id=None,
            article_id=None,
            student_id=None,
            group_id=None,
            teacher_id=None,
            status=FinanceTransactionStatus.NEW,
        )
        db.add(tx)
        # авто‑классификация по правилам для новых импортированных операций
        apply_recognition_rules(db, tx)
        try:
            # Коммитим построчно, чтобы перехватить возможные уникальные конфликты
            db.commit()
            created += 1
        except IntegrityError:
            # Дубликат по уникальному индексу или другой конфликт — пропускаем строку
            db.rollback()
            skipped += 1

    if filename.endswith(".csv"):
        bank_source = "import_csv"
        text = content.decode("utf-8", errors="ignore")
        reader = csv.DictReader(StringIO(text))
        for row in reader:
            date_str = (row.get("date") or "").strip()
            amount_raw = (row.get("amount") or "").replace(" ", "").replace(",", ".")
            try:
                amount_val = float(amount_raw)
            except ValueError:
                skipped += 1
                continue
            counterparty = (row.get("counterparty") or "").strip()
            description = (row.get("description") or "").strip()
            bank_operation_id = (row.get("bank_operation_id") or "").strip() or None
            _upsert_row(date_str, amount_val, counterparty, description, bank_operation_id, bank_source)
    elif filename.endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl не установлен в окружении сервера")

        # Для нового импорта Excel используем отдельный bank_source,
        # чтобы не конфликтовать со старыми записями ("import_xlsx").
        bank_source = "import_xlsx_v2"
        wb = load_workbook(filename=BytesIO(content), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail="Файл .xlsx без строк")

        # Нормализуем заголовки: поддерживаем как минимальный формат
        # (date, amount, counterparty, description, bank_operation_id),
        # так и русские выгрузки из банка (Дата, Сумма, Контрагент, Описание / источник, Тип).
        raw_header = [str(v).strip().lower() if v is not None else "" for v in rows[0]]
        rus_to_std = {
            "дата": "date",
            "сумма": "amount",
            "контрагент": "counterparty",
            "описание / источник": "description",
            "описание/источник": "description",
            "описание": "description",
            "тип": "type",
        }
        header = [rus_to_std.get(name, name) for name in raw_header]
        col_index = {name: idx for idx, name in enumerate(header)}

        for r in rows[1:]:
            if not any(r):
                continue

            def _get(col: str) -> str:
                idx = col_index.get(col)
                if idx is None or idx >= len(r):
                    return ""
                val = r[idx]
                return "" if val is None else str(val).strip()

            date_str = _get("date")
            # Поддержка формата дат dd.mm.yyyy (банковская выгрузка) и ISO yyyy-mm-dd
            if date_str and "." in date_str and "-" not in date_str:
                from datetime import datetime as _dt

                try:
                    parsed = _dt.strptime(date_str, "%d.%m.%Y")
                    date_str = parsed.date().isoformat()
                except Exception:
                    # Некорректные даты отфильтрует _upsert_row
                    pass

            amount_raw = _get("amount").replace(" ", "").replace(",", ".")
            try:
                amount_val = float(amount_raw)
            except ValueError:
                skipped += 1
                continue

            # Для банковских выгрузок, где сумма всегда положительная,
            # используем колонку "Тип" (Доход / Расход), если она есть.
            tx_type = _get("type").lower()
            if tx_type.startswith("расход"):
                amount_val = -abs(amount_val)
            elif tx_type.startswith("доход"):
                amount_val = abs(amount_val)

            counterparty = _get("counterparty")
            description = _get("description")
            bank_operation_id = _get("bank_operation_id") or None
            _upsert_row(date_str, amount_val, counterparty, description, bank_operation_id, bank_source)
    else:
        raise HTTPException(status_code=400, detail="Поддерживаются только форматы .csv и .xlsx")

    # Итоговые числа по импортированным и пропущенным строкам
    return {"imported": created, "skipped": skipped}


@router.post("/personal-operation", response_model=FinanceLedgerTransactionRow)
async def create_personal_operation(
    payload: FinancePersonalOperationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerTransactionRow:
    """
    Создание ручной операции для личных финансов в едином журнале.

    Используется страницей «Личные финансы» при добавлении операций вручную.
    """
    _require_finance_access(current_user)

    date_str = payload.date.isoformat()
    amount = float(payload.amount or 0.0)
    if amount == 0:
        raise HTTPException(status_code=400, detail="amount must be non-zero")

    direction = "income" if amount > 0 else "expense"
    description = (payload.description or "").strip()
    bank_source = "manual_personal"

    # Подбор target_id по коду
    target = db.query(FinanceTarget).filter(FinanceTarget.code == payload.target_code).first()
    target_id = target.id if target else None

    dedup_seed = f"{bank_source}|{date_str}|{amount}|{description}"
    dedup_hash = hashlib.sha1(dedup_seed.encode("utf-8")).hexdigest()

    existing = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(
            FinanceTransaction.bank_source == bank_source,
            FinanceTransaction.dedup_hash == dedup_hash,
        )
        .first()
    )
    if existing:
        tx = existing
    else:
        occurred_at = datetime.fromisoformat(date_str + "T12:00:00")
        tx = FinanceTransaction(
            occurred_at=occurred_at,
            amount=amount,
            direction=direction,
            account_id=None,
            to_account_id=None,
            transfer_group_id=None,
            counterparty_name=description or None,
            counterparty_phone=None,
            description_raw=None,
            bank_source=bank_source,
            bank_operation_id=None,
            dedup_hash=dedup_hash,
            target_id=target_id,
            article_id=None,
            student_id=None,
            group_id=None,
            teacher_id=None,
            status=FinanceTransactionStatus.NEW,
        )
        db.add(tx)
        apply_recognition_rules(db, tx)
        db.commit()
        db.refresh(tx)

    target = getattr(tx, "target", None)
    article = getattr(tx, "article", None)
    return FinanceLedgerTransactionRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=float(tx.amount or 0.0),
        direction=str(getattr(tx.direction, "value", tx.direction)),
        target_code=getattr(target, "code", None),
        target_name=getattr(target, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article, "name", None) if article else None,
        counterparty_name=tx.counterparty_name,
        description_raw=tx.description_raw,
    )


@router.post("/manual-transaction", response_model=FinanceLedgerBankRow)
async def create_manual_transaction(
    payload: FinanceManualTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Ручное добавление операции в единый журнал (например, наличные — счёт «Наличка»).
    Операция создаётся сразу с статусом classified.
    """
    _require_finance_access(current_user)

    amount = float(payload.amount or 0.0)
    if amount == 0:
        raise HTTPException(status_code=400, detail="Сумма не может быть нулевой")

    if payload.direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное направление: income или expense")

    account = db.query(FinanceAccount).filter(FinanceAccount.id == payload.account_id, FinanceAccount.is_active.is_(True)).first()
    if not account:
        raise HTTPException(status_code=400, detail="Счёт не найден или неактивен")

    if payload.article_id and not db.query(FinanceArticle.id).filter(FinanceArticle.id == payload.article_id).first():
        raise HTTPException(status_code=400, detail="Статья не найдена")
    if payload.target_id and not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
        raise HTTPException(status_code=400, detail="Цель/проект не найден")

    occurred_at = datetime.combine(payload.occurred_at, datetime.min.time())
    description = (payload.description or "").strip() or None

    tx = FinanceTransaction(
        occurred_at=occurred_at,
        amount=abs(amount),
        direction=FinanceTransactionDirection(payload.direction),  # type: ignore[call-arg]
        account_id=payload.account_id,
        to_account_id=None,
        transfer_group_id=None,
        counterparty_name=description,
        counterparty_phone=None,
        description_raw=description,
        bank_source="manual",
        bank_operation_id=None,
        dedup_hash=None,
        target_id=payload.target_id,
        article_id=payload.article_id,
        student_id=None,
        group_id=None,
        teacher_id=None,
        status=FinanceTransactionStatus.CLASSIFIED,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    tx = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.id == tx.id)
        .first()
    )
    account = getattr(tx, "account", None)
    to_account = getattr(tx, "to_account", None)
    target = getattr(tx, "target", None)
    article = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=float(tx.amount or 0.0),
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account, "code", None),
        account_name=getattr(account, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account, "code", None),
        to_account_name=getattr(to_account, "name", None),
        transfer_group_id=tx.transfer_group_id,
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


@router.post("/migrate-personal-finance")
async def migrate_personal_finance(
    payload: Dict[str, list],
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, int]:
    """
    Миграция данных «Личных финансов» из localStorage в единый финансовый журнал.

    Ожидаемый формат payload:
    {
      "articles": [{ id, name, type: "income"|"expense" }],
      "operations": [{ date, amount, description, target, articleId, createdAt }],
      "recognitionRules": [{ pattern, displayName }]
    }
    """
    _require_finance_access(current_user)

    articles_in = payload.get("articles") or []
    ops_in = payload.get("operations") or []
    rules_in = payload.get("recognitionRules") or []

    # --- Статьи ---
    # Мапа: (name, direction, scope) -> article_id
    existing_articles = db.query(FinanceArticle).all()
    article_map: Dict[str, int] = {}
    for a in existing_articles:
        key = f"{a.name.strip().lower()}|{getattr(a.direction, 'value', a.direction)}|{getattr(a.scope, 'value', a.scope)}"
        article_map[key] = a.id

    created_articles = 0
    personal_scope = "personal"
    for a in articles_in:
        name = (a.get("name") or "").strip()
        if not name:
            continue
        direction = "income" if a.get("type") == "income" else "expense"
        key = f"{name.lower()}|{direction}|{personal_scope}"
        if key in article_map:
            continue
        new_article = FinanceArticle(
            name=name,
            direction=direction,
            cost_kind="none",
            scope=personal_scope,
            is_active=True,
        )
        db.add(new_article)
        db.flush()
        article_map[key] = new_article.id
        created_articles += 1

    # --- Targets (personal / leninets / gogol_mogol / academy) ---
    targets = {t.code: t.id for t in db.query(FinanceTarget).all()}

    def _target_id_for(op_target: str) -> Optional[int]:
        return targets.get(op_target)

    # --- Операции ---
    created_ops = 0
    seen_dedup_in_batch: Set[Tuple[str, str]] = set()  # (bank_source, dedup_hash) уже добавленные в этом запросе
    for op in ops_in:
        date_str = op.get("date")
        try:
            occurred_at = datetime.fromisoformat(date_str + "T12:00:00") if date_str else None
        except Exception:
            occurred_at = None
        amount = float(op.get("amount") or 0.0)
        if amount == 0:
            continue
        direction = "income" if amount > 0 else "expense"
        description = (op.get("description") or "").strip()
        target_code = op.get("target") or "personal"
        article_id_str = op.get("articleId")

        # Подбор article_id по названию
        article_id: Optional[int] = None
        if article_id_str:
            art = next((a for a in articles_in if a.get("id") == article_id_str), None)
            if art:
                art_name = (art.get("name") or "").strip()
                if art_name:
                    key = f"{art_name.lower()}|{direction}|{personal_scope}"
                    article_id = article_map.get(key)

        # dedup_hash для миграции personal_finance
        bank_source = "personal_legacy"
        dedup_seed = f"{bank_source}|{date_str or ''}|{amount}|{description}"
        dedup_hash = hashlib.sha1(dedup_seed.encode("utf-8")).hexdigest()

        dedup_key = (bank_source, dedup_hash)
        if dedup_key in seen_dedup_in_batch:
            continue
        existing = (
            db.query(FinanceTransaction.id)
            .filter(
                FinanceTransaction.bank_source == bank_source,
                FinanceTransaction.dedup_hash == dedup_hash,
            )
            .first()
        )
        if existing:
            continue

        seen_dedup_in_batch.add(dedup_key)
        tx = FinanceTransaction(
            occurred_at=occurred_at,
            amount=amount,
            direction=direction,
            account_id=None,
            to_account_id=None,
            transfer_group_id=None,
            counterparty_name=description or None,
            counterparty_phone=None,
            description_raw=None,
            bank_source=bank_source,
            bank_operation_id=None,
            dedup_hash=dedup_hash,
            target_id=_target_id_for(target_code),
            article_id=article_id,
            student_id=None,
            group_id=None,
            teacher_id=None,
            status=FinanceTransactionStatus.CLASSIFIED if article_id else FinanceTransactionStatus.NEW,
        )
        db.add(tx)
        if tx.status == FinanceTransactionStatus.NEW:
            # пытаемся дополнительно классифицировать по правилам
            apply_recognition_rules(db, tx)
        created_ops += 1

    # --- Правила опознавания ---
    created_rules = 0
    for r in rules_in:
        pattern = (r.get("pattern") or "").strip()
        display_name = (r.get("displayName") or "").strip()
        if not pattern or not display_name:
            continue

        exists = (
            db.query(FinanceRecognitionRule.id)
            .filter(
                FinanceRecognitionRule.pattern == pattern,
                FinanceRecognitionRule.target_id.is_(None),
            )
            .first()
        )
        if exists:
            continue

        rule = FinanceRecognitionRule(
            pattern=pattern,
            match_type="contains",
            priority=len(pattern),
            target_id=None,
            article_id=None,
            direction_override=None,
            is_active=True,
        )
        db.add(rule)
        created_rules += 1

    db.commit()

    return {
        "articles_created": created_articles,
        "operations_created": created_ops,
        "recognition_rules_created": created_rules,
    }


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
                transfer_group_id=tx.transfer_group_id,
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


@router.get("/transactions", response_model=List[FinanceLedgerBankRow])
async def list_finance_transactions(
    account_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по счетам (finance_accounts.id). Пусто = все активные счета.",
    ),
    target_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по проектам (finance_targets.id). Пусто = все.",
    ),
    article_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по статьям (finance_articles.id). Пусто = все.",
    ),
    direction: Optional[str] = Query(
        None,
        description="Фильтр по типу операции: income | expense | transfer",
    ),
    status: Optional[List[str]] = Query(
        None,
        description="Фильтр по статусу finance_transactions: new, classified, applied (если используется). Пусто = все.",
    ),
    unclassified_only: bool = Query(
        False,
        description="Только неразобранные операции (target_id IS NULL OR article_id IS NULL)",
    ),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    limit: int = Query(5000, ge=1, le=50000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerBankRow]:
    """
    Каноничный список операций единого финансового журнала.

    Используется вкладкой «Все операции» в разделе Финансы → Журнал.
    Возвращает те же поля, что и /finance/ledger/bank, но без фильтра по bank_source
    (включает как банковские операции, так и ручные / импортированные записи).
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .order_by(FinanceTransaction.occurred_at.desc(), FinanceTransaction.id.desc())
    )

    if account_ids:
        q = q.filter(FinanceTransaction.account_id.in_(account_ids))
    if target_ids:
        q = q.filter(FinanceTransaction.target_id.in_(target_ids))
    if article_ids:
        q = q.filter(FinanceTransaction.article_id.in_(article_ids))
    if direction:
        if direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        q = q.filter(FinanceTransaction.direction == FinanceTransactionDirection(direction))  # type: ignore[call-arg]
    if status:
        allowed = {s.value for s in FinanceTransactionStatus}  # type: ignore[attr-defined]
        invalid = [s for s in status if s not in allowed]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный status: {', '.join(invalid)}",
            )
        q = q.filter(FinanceTransaction.status.in_(status))
    if unclassified_only:
        q = q.filter(
            (FinanceTransaction.target_id.is_(None))
            | (FinanceTransaction.article_id.is_(None))
        )
    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

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
                amount=float(tx.amount or 0.0),
                direction=str(getattr(tx.direction, "value", tx.direction)),
                status=str(getattr(tx.status, "value", tx.status)),
                account_id=tx.account_id,
                account_code=getattr(account, "code", None),
                account_name=getattr(account, "name", None),
                to_account_id=tx.to_account_id,
                to_account_code=getattr(to_account, "code", None),
                to_account_name=getattr(to_account, "name", None),
                transfer_group_id=tx.transfer_group_id,
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

    if payload.transfer_group_id is not None:
        tx.transfer_group_id = payload.transfer_group_id or None

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


@router.delete("/transactions/{transaction_id}")
async def delete_finance_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Удаление транзакции журнала (используется только в личных финансах)."""
    _require_finance_access(current_user)

    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Транзакция не найдена")

    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.post("/transactions/{transaction_id}/apply-student", response_model=FinanceLedgerBankRow)
async def apply_finance_transaction_to_student(
    transaction_id: int,
    payload: FinanceTransactionApplyStudentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Зачислить операцию журнала на счёт ученика.

    Используется журналом (Финансы → Журнал), чтобы не идти в таб «Операции банка».
    Создаёт StudentAccountTransaction, обновляет баланс счёта и помечает транзакцию как applied.
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

    if tx.direction != FinanceTransactionDirection.INCOME:
        raise HTTPException(status_code=400, detail="Зачислить ученику можно только доходную операцию")

    amount = float(tx.amount or 0.0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма операции должна быть больше 0")

    try:
        pay_date = tx.occurred_at.date() if tx.occurred_at else date.today()
    except Exception:
        pay_date = date.today()
    note = tx.counterparty_name or tx.description_raw or "Платёж из журнала"
    try:
        from app.services.student_account_payment import add_payment_to_student_account
        add_payment_to_student_account(db, payload.student_id, amount, note, pay_date)
    except ValueError as e:
        if "не найден" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

    tx.status = FinanceTransactionStatus.APPLIED
    tx.student_id = payload.student_id

    db.commit()
    db.refresh(tx)

    account_obj: Optional[FinanceAccount] = getattr(tx, "account", None)
    to_account_obj: Optional[FinanceAccount] = getattr(tx, "to_account", None)
    target_obj: Optional[FinanceTarget] = getattr(tx, "target", None)
    article_obj: Optional[FinanceArticle] = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=float(tx.amount or 0.0),
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account_obj, "code", None),
        account_name=getattr(account_obj, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account_obj, "code", None),
        to_account_name=getattr(to_account_obj, "name", None),
        transfer_group_id=tx.transfer_group_id,
        counterparty_name=tx.counterparty_name,
        counterparty_phone=tx.counterparty_phone,
        bank_source=tx.bank_source,
        bank_operation_id=tx.bank_operation_id,
        target_id=tx.target_id,
        target_code=getattr(target_obj, "code", None),
        target_name=getattr(target_obj, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article_obj, "name", None),
        student_id=tx.student_id,
    )


# --- Счета учеников (StudentAccount): канонический API Finance по ТЗ ---


class FinanceStudentAccountCreate(BaseModel):
    """Создание счёта ученика через Finance API."""
    student_id: int
    name: str


@router.post("/student-accounts", response_model=StudentAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_student_account_finance(
    payload: FinanceStudentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(dep_require_finance_access),
) -> StudentAccountResponse:
    """Создать счёт ученику. Канонический API Finance (ТЗ этап 4)."""
    try:
        account = finance_create_student_account(db, payload.student_id, payload.name or "")
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    db.commit()
    db.refresh(account)
    return StudentAccountResponse.model_validate(account)


# --- Банковские операции (BankTransaction): канонический API Finance по ТЗ ---


@router.post("/bank-transactions/{transaction_id}/apply", response_model=BankTransactionResponse)
async def apply_bank_transaction_to_student(
    transaction_id: int,
    payload: BankTransactionApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(dep_require_finance_access),
) -> BankTransactionResponse:
    """
    Зачислить банковскую операцию (BankTransaction) на выбранного ученика.
    Канонический API Finance; дублирует функциональность POST /api/sales/bank-transactions/{id}/apply (compatibility layer).
    """
    try:
        result = bank_operation_apply(db, transaction_id, payload.student_id)
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return BankTransactionResponse.model_validate(result.transaction)

