"""Сверка приходов Точки по группе «день + сумма».

Банк отдаёт один платёж двумя строками (с разницей около минуты): платёж клиента (реальное ФИО) и зачисление от
«ООО Банк Точка» с QR ID в назначении. Общих полей, по которым строки можно связать
напрямую, нет, а одинаковых сумм за день бывает много (например, 4 900), поэтому парное
сопоставление упирается в неоднозначность. Здесь связь считается по количеству:
у каждого платежа с ФИО есть ровно одно зачисление-заглушка, всё, что сверх этого,
остаётся самостоятельными платежами без имени.

Скрываются только заглушки не applied. Скрытая запись получает статус ignored, её внешние ID
переносятся алиасами на запись с ФИО, чтобы повторная доставка не создала её заново.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Tuple

from sqlalchemy.orm import Session

from app.models import (
    BankTransaction,
    BankTransactionAlias,
    BankTransactionStatus,
    FinanceTransaction,
    LegoPayment,
    StudentAccountTransaction,
)
from app.services.bank_identity import is_generic_counterparty, normalize_bank_operation_date

logger = logging.getLogger(__name__)


# Строки одного платежа приходят от банка с разницей в минуту; даты операции у банка без
# времени, поэтому сравниваем моменты поступления к нам (BankTransaction.created_at).
PAIR_WINDOW_SECONDS = 15 * 60


def _arrival_gap_seconds(a, b) -> float:
    ta, tb = getattr(a, "created_at", None), getattr(b, "created_at", None)
    if ta is None or tb is None:
        return 0.0  # нет времени поступления — различить нечем, считаем близкими
    try:
        return abs((ta - tb).total_seconds())
    except TypeError:  # aware против naive
        return abs((ta.replace(tzinfo=None) - tb.replace(tzinfo=None)).total_seconds())


def plan_generic_income_hides(rows: Iterable) -> List[Tuple[int, int]]:
    """Пары (id заглушки, id платежа с ФИО): заглушка дублирует этот платёж.

    Пары строятся жадно по близости времени поступления, каждая сторона участвует не более
    одного раза. Заглушка без пары (пришла намного позже или лишняя) остаётся самостоятельным
    платежом. Заглушки applied участвуют в подборе пар, но никогда не скрываются.
    """
    reals = []
    generics = []
    for row in rows:
        name = (row.payer_name or "").strip()
        if not name:
            continue
        (generics if is_generic_counterparty(name) else reals).append(row)

    candidates = sorted(
        (
            (_arrival_gap_seconds(g, r), g.id, r.id, g, r)
            for g in generics
            for r in reals
            if _arrival_gap_seconds(g, r) <= PAIR_WINDOW_SECONDS
        ),
        key=lambda item: item[:3],
    )
    used_generics, used_reals = set(), set()
    pairs: List[Tuple[int, int]] = []
    for _gap, gid, rid, generic, _real in candidates:
        if gid in used_generics or rid in used_reals:
            continue
        used_generics.add(gid)
        used_reals.add(rid)
        if generic.status != BankTransactionStatus.APPLIED.value:
            pairs.append((gid, rid))
    return pairs


def reconcile_generic_income(db: Session, payment_date: str, amount: float) -> List[int]:
    """Скрывает дубли-заглушки в группе день+сумма. Возвращает id скрытых BankTransaction."""
    day = normalize_bank_operation_date(payment_date)
    if not day or not amount:
        return []
    rows = (
        db.query(BankTransaction)
        .filter(
            BankTransaction.tochka_account_id.isnot(None),
            BankTransaction.amount == abs(float(amount)),
            BankTransaction.payment_date.like(f"{day}%"),
            BankTransaction.status.notin_(
                [BankTransactionStatus.IGNORED.value, BankTransactionStatus.EXPENSE.value]
            ),
        )
        .order_by(BankTransaction.id.asc())
        .all()
    )
    rows = [r for r in rows if normalize_bank_operation_date(r.payment_date) == day]
    pairs = dict(plan_generic_income_hides(rows))
    if not pairs:
        return []

    hidden: List[int] = []
    for row in rows:
        if row.id not in pairs:
            continue
        target_id = pairs[row.id]
        existing_alias_ids = {
            a.external_id for a in db.query(BankTransactionAlias).filter(BankTransactionAlias.bank_transaction_id == row.id)
        }
        external_ids = {row.operation_id, *existing_alias_ids}
        for external_id in external_ids:
            if not external_id:
                continue
            alias = db.query(BankTransactionAlias).filter(BankTransactionAlias.external_id == external_id).first()
            if alias is None:
                db.add(BankTransactionAlias(
                    bank_transaction_id=target_id, source="tochka_webhook", external_id=external_id,
                ))
            elif alias.bank_transaction_id == row.id:
                alias.bank_transaction_id = target_id

        ft = (
            db.query(FinanceTransaction)
            .filter(FinanceTransaction.bank_source == "tochka", FinanceTransaction.bank_operation_id == row.operation_id)
            .first()
        )
        if ft is not None and getattr(ft.status, "value", ft.status) != "applied":
            linked = (
                db.query(StudentAccountTransaction.id).filter(StudentAccountTransaction.finance_transaction_id == ft.id).first()
                or db.query(LegoPayment.id).filter(LegoPayment.finance_transaction_id == ft.id).first()
            )
            if linked is None:
                db.delete(ft)

        row.status = BankTransactionStatus.IGNORED.value
        row.student_id = None
        row.student_account_id = None
        hidden.append(row.id)
        logger.info("bank reconcile: generic income id=%s hidden as duplicate of id=%s", row.id, target_id)
    db.flush()
    return hidden
