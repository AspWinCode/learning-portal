"""
Клиент API Точка Банк (https://developers.tochka.com/).
Авторизация: JWT токен используется напрямую как Bearer в заголовке Authorization.
Никакого обмена токенов — просто вставить JWT в каждый запрос.

Переменные окружения:
  TOCHKA_JWT_TOKEN  — JWT токен из интернет-банка Точки
  TOCHKA_ACCOUNT_ID — номер расчётного счёта (20 цифр)
"""
import os
import time
import json
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional, List, Dict, Any
from datetime import date, timedelta


TOCHKA_API_BASE = "https://enter.tochka.com/uapi/"


def _get_jwt() -> str:
    return (os.getenv("TOCHKA_JWT_TOKEN") or "").strip()


def is_configured() -> bool:
    return bool(_get_jwt())


def is_auto_import_configured() -> bool:
    if not is_configured():
        return False
    account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    return bool(account_id)


def get_access_token() -> str:
    """
    Совместимость: возвращает JWT токен напрямую.
    Точка не требует обмена — JWT используется как Bearer.
    """
    jwt = _get_jwt()
    if not jwt:
        raise ValueError("TOCHKA_JWT_TOKEN не задан")
    return jwt


def _api_request(
    method: str,
    path: str,
    token: Optional[str] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    token = token or get_access_token()
    url = TOCHKA_API_BASE.rstrip("/") + "/" + path.lstrip("/")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_err: Any = {}
        try:
            body_err = json.loads(e.read().decode())
        except Exception:
            pass
        raise ValueError(f"Точка API {method} {path}: {e.code} {body_err}")


def get_accounts(token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Список счетов клиента."""
    resp = _api_request("GET", "open-banking/v1.0/accounts", token)
    # Ответ: {"Data": {"Account": [...]}}
    data = resp.get("Data") or resp.get("data") or resp
    if isinstance(data, dict):
        accounts = data.get("Account") or data.get("accounts") or data.get("account") or []
    else:
        accounts = data if isinstance(data, list) else []
    return accounts


def resolve_account_id(account_id: str, token: Optional[str] = None) -> str:
    """
    Возвращает полный accountId в формате 'NNNN/BIK' как в Tochka API.
    Если account_id уже содержит '/', возвращает как есть.
    Иначе ищет счёт в списке и возвращает полный ID.
    """
    if "/" in account_id:
        return account_id
    try:
        accounts = get_accounts(token)
        for acc in accounts:
            full_id = acc.get("accountId", "")
            # Сравниваем начало: "40802810020000440578/044525104".startswith("40802810020000440578")
            if isinstance(full_id, str) and full_id.startswith(account_id):
                return full_id
    except Exception:
        pass
    return account_id  # fallback: вернуть как есть


def init_statement(account_id: str, date_from: date, date_to: date, token: Optional[str] = None) -> str:
    """Запросить создание выписки. Возвращает statementId."""
    resp = _api_request("POST", "open-banking/v1.0/statements", token, body={
        "Data": {
            "Statement": {
                "accountId": account_id,
                "startDateTime": date_from.isoformat() + "T00:00:00+00:00",
                "endDateTime": (date_to + timedelta(days=1)).isoformat() + "T00:00:00+00:00",
            }
        }
    })
    # Ответ: {"Data": {"statementId": "..."}} или {"Data": {"Statement": {"statementId": "..."}}}
    data = resp.get("Data") or resp
    st_id = (
        data.get("statementId") or data.get("StatementId")
        or (data.get("Statement") or {}).get("statementId")
        or (data.get("Statement") or {}).get("StatementId")
    )
    if not st_id:
        raise ValueError(f"Точка Банк: нет statementId в ответе: {resp}")
    return st_id


def get_statement(account_id: str, statement_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    """Получить выписку по statementId."""
    return _api_request(
        "GET",
        f"open-banking/v1.0/accounts/{account_id}/statements/{statement_id}",
        token,
    )


def fetch_statement_ready(
    account_id: str,
    date_from: date,
    date_to: date,
    token: Optional[str] = None,
    poll_interval_sec: float = 2.0,
    max_wait_sec: float = 120.0,
) -> Dict[str, Any]:
    """Запросить выписку и дождаться статуса Ready."""
    token = token or get_access_token()
    # Резолвим полный accountId (с BIK), если передан только номер счёта
    full_account_id = resolve_account_id(account_id, token)
    st_id = init_statement(full_account_id, date_from, date_to, token)
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        time.sleep(poll_interval_sec)
        st = get_statement(full_account_id, st_id, token)
        data = st.get("Data") or st.get("data") or st
        status = ""
        if isinstance(data, dict):
            status = (
                data.get("status") or data.get("Status")
                or data.get("statement", {}).get("status") or ""
            ).lower()
        if status == "ready":
            return st
        if status in ("failed", "error", "cancelled"):
            raise ValueError(f"Точка Банк: выписка не создана, статус {status}")
    raise TimeoutError("Точка Банк: выписка не готова за отведённое время")


def extract_incoming_transactions(statement: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Из тела выписки извлечь все операции (приход и расход)."""
    # Пробуем разные структуры ответа Точки
    transactions = []
    data = statement.get("Data") or statement.get("data") or statement
    if isinstance(data, dict):
        for key in ("Transaction", "transactions", "transactionList", "operations"):
            if key in data and isinstance(data[key], list):
                transactions = data[key]
                break
    if not transactions:
        for key in ("transactions", "transactionList", "data", "operations"):
            if key in statement and isinstance(statement[key], list):
                transactions = statement[key]
                break

    result = []
    for tx in transactions:
        ind = (
            tx.get("CreditDebitIndicator") or tx.get("creditDebitIndicator")
            or tx.get("credit_debit_indicator") or ""
        ).lower()
        amount_data = tx.get("Amount") or tx.get("amount") or tx.get("TransactionAmount") or {}
        if isinstance(amount_data, dict):
            amount = amount_data.get("Amount") or amount_data.get("amount")
        else:
            amount = amount_data or tx.get("amountNat")
        if amount is None:
            continue
        try:
            amount_float = float(amount)
        except (TypeError, ValueError):
            continue

        # Плательщик
        debtor = tx.get("DebtorAgent") or tx.get("debtor") or tx.get("debtorAccount") or {}
        if isinstance(debtor, str):
            payer_name = debtor
        else:
            payer_name = (
                debtor.get("Name") or debtor.get("name") or debtor.get("fio")
                or debtor.get("displayName") or tx.get("payerName") or tx.get("payer_name") or ""
            )
        payer_phone_raw = ""
        if isinstance(debtor, dict):
            payer_phone_raw = (
                debtor.get("phone") or debtor.get("phoneNumber")
                or debtor.get("mobile") or debtor.get("contact") or ""
            )
        if not payer_phone_raw:
            payer_phone_raw = tx.get("payerPhone") or tx.get("payer_phone") or ""

        tx_date = (
            tx.get("BookingDateTime") or tx.get("bookingDate")
            or tx.get("date") or tx.get("valueDate") or tx.get("chargeDate") or ""
        )
        operation_id = (
            tx.get("TransactionId") or tx.get("transactionId")
            or tx.get("instructionId") or tx.get("endToEndId")
            or tx.get("id") or tx.get("transaction_id") or ""
        )
        if isinstance(operation_id, dict):
            operation_id = operation_id.get("id") or operation_id.get("value") or ""
        operation_id = str(operation_id).strip() if operation_id else ""

        result.append({
            "date": tx_date,
            "amount": amount_float,
            "direction": "income" if ind == "credit" else "expense",
            "payer_name": (payer_name or "").strip(),
            "payer_phone_raw": (payer_phone_raw or "").strip(),
            "operation_id": operation_id,
            "raw": tx,
        })
    return result
