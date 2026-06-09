import ast
import operator
import re
from datetime import datetime
from typing import Callable, Dict, List, Match, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    FinanceAccount,
    FinanceArticle,
    FinanceTransaction,
    FinanceTransactionDirection,
)


SAFE_OPERATORS: Dict[type, Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}


def parse_period(period: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
    if not period:
        return None, None
    start = datetime.strptime(f"{period}-01", "%Y-%m-%d")
    if start.month == 12:
        end = datetime(start.year + 1, 1, 1)
    else:
        end = datetime(start.year, start.month + 1, 1)
    return start, end


def _article_ids_for_code(db: Session, target_id: int, code: str) -> List[int]:
    root = (
        db.query(FinanceArticle)
        .filter(
            FinanceArticle.target_id == target_id,
            FinanceArticle.code == code,
            FinanceArticle.is_active.is_(True),
        )
        .first()
    )
    if not root:
        return []
    ids = [root.id]
    stack = [root.id]
    while stack:
        current = stack.pop()
        children = (
            db.query(FinanceArticle.id)
            .filter(FinanceArticle.parent_id == current, FinanceArticle.is_active.is_(True))
            .all()
        )
        for child in children:
            child_id = int(child[0])
            ids.append(child_id)
            stack.append(child_id)
    return ids


def _tx_query(db: Session, target_id: int, period: Optional[str]):
    date_from, date_to = parse_period(period)
    q = db.query(FinanceTransaction).filter(FinanceTransaction.target_id == target_id)
    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= date_from)
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at < date_to)
    return q


def aggregate_article(db: Session, target_id: int, code: str, period: Optional[str], kind: str) -> float:
    ids = _article_ids_for_code(db, target_id, code)
    if not ids:
        return 0.0
    q = _tx_query(db, target_id, period).filter(FinanceTransaction.article_id.in_(ids))
    if kind == "count":
        return float(q.count())
    total = q.with_entities(func.coalesce(func.sum(FinanceTransaction.amount), 0.0)).scalar() or 0.0
    if kind == "avg":
        count = q.count()
        return float(total) / count if count else 0.0
    return float(total)


def balance(db: Session, target_id: int) -> float:
    account_ids = [
        row[0]
        for row in db.query(FinanceTransaction.account_id)
        .filter(FinanceTransaction.target_id == target_id, FinanceTransaction.account_id.isnot(None))
        .distinct()
        .all()
    ]
    if not account_ids:
        account_ids = [row[0] for row in db.query(FinanceAccount.id).filter(FinanceAccount.is_active.is_(True)).all()]
    income = (
        db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0.0))
        .filter(
            FinanceTransaction.account_id.in_(account_ids),
            FinanceTransaction.direction == FinanceTransactionDirection.INCOME,
        )
        .scalar()
        or 0.0
    )
    expense = (
        db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0.0))
        .filter(
            FinanceTransaction.account_id.in_(account_ids),
            FinanceTransaction.direction == FinanceTransactionDirection.EXPENSE,
        )
        .scalar()
        or 0.0
    )
    return float(income) - float(expense)


def _safe_eval_expression(expression: str) -> float:
    tree = ast.parse(expression, mode="eval")

    def eval_node(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return eval_node(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -eval_node(node.operand)
        if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPERATORS:
            left = eval_node(node.left)
            right = eval_node(node.right)
            if isinstance(node.op, ast.Div) and right == 0:
                return 0.0
            return SAFE_OPERATORS[type(node.op)](left, right)
        raise ValueError("Unsupported metric formula expression")

    return float(eval_node(tree))


def compute_metric_formula(db: Session, target_id: int, formula: str, period: Optional[str] = None) -> float:
    normalized = str(formula or "").strip()
    if not normalized:
        return 0.0

    def replace_function(match: Match[str]) -> str:
        fn_name = match.group(1).upper()
        code = match.group(2).strip()
        if fn_name == "SUM":
            return str(aggregate_article(db, target_id, code, period, "sum"))
        if fn_name == "COUNT":
            return str(aggregate_article(db, target_id, code, period, "count"))
        if fn_name == "AVG_TRANSACTION":
            return str(aggregate_article(db, target_id, code, period, "avg"))
        raise ValueError(f"Unsupported metric function: {fn_name}")

    expression = re.sub(r"\b(SUM|COUNT|AVG_TRANSACTION)\(\s*([a-zA-Z0-9_\-]+)\s*\)", replace_function, normalized)
    expression = re.sub(r"\bBALANCE\(\s*\)", str(balance(db, target_id)), expression)
    return _safe_eval_expression(expression)
