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


def _extract_statement_status(resp: Dict[str, Any]) -> str:
    """Извлечь статус из ответа GET /statements/{id}.
    Ответ: {"Data": {"Statement": [{..., "status": "Ready", ...}]}}
    """
    data = resp.get("Data") or resp.get("data") or resp
    if not isinstance(data, dict):
        return ""
    st = data.get("Statement") or data.get("statement")
    if isinstance(st, list) and st:
        return str(st[0].get("status") or st[0].get("Status") or "").lower()
    if isinstance(st, dict):
        return str(st.get("status") or st.get("Status") or "").lower()
    return str(data.get("status") or data.get("Status") or "").lower()


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
        status = _extract_statement_status(st)
        if status == "ready":
            return st
        if status in ("failed", "error", "cancelled"):
            raise ValueError(f"Точка Банк: выписка не создана, статус {status}")
    raise TimeoutError("Точка Банк: выписка не готова за отведённое время")


def extract_incoming_transactions(statement: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Из тела выписки (GET .../statements/{id}) извлечь все операции.

    Формат ответа Точки:
    {"Data": {"Statement": [{"Transaction": [{transactionId, creditDebitIndicator, ...}]}]}}
    """
    transactions: List[Dict[str, Any]] = []

    # Основной путь: Data.Statement[0].Transaction
    data = statement.get("Data") or statement.get("data") or {}
    if isinstance(data, dict):
        st_list = data.get("Statement") or data.get("statement")
        if isinstance(st_list, list) and st_list:
            st_obj = st_list[0]
        elif isinstance(st_list, dict):
            st_obj = st_list
        else:
            st_obj = data
        if isinstance(st_obj, dict):
            txs = st_obj.get("Transaction") or st_obj.get("transactions") or st_obj.get("transactionList") or []
            if isinstance(txs, list):
                transactions = txs

    # Fallback: прямой список транзакций
    if not transactions:
        for key in ("Transaction", "transactions", "transactionList", "operations"):
            if isinstance(statement.get(key), list):
                transactions = statement[key]
                break

    result = []
    for tx in transactions:
        ind = (
            tx.get("creditDebitIndicator") or tx.get("CreditDebitIndicator")
            or tx.get("credit_debit_indicator") or ""
        ).lower()

        # Сумма — у Точки в поле "amount" (float) или в объекте Amount
        amount_raw = tx.get("amount") or tx.get("Amount") or tx.get("transactionAmount") or tx.get("amountNat")
        if isinstance(amount_raw, dict):
            amount_raw = amount_raw.get("Amount") or amount_raw.get("amount")
        if amount_raw is None:
            continue
        try:
            amount_float = abs(float(amount_raw))
        except (TypeError, ValueError):
            continue

        # Плательщик (у Точки поля: payerName, debtor, debtorAccount)
        payer_name = (
            tx.get("payerName") or tx.get("payer_name") or tx.get("PayerName") or ""
        ).strip()
        if not payer_name:
            debtor = tx.get("DebtorAgent") or tx.get("debtor") or tx.get("debtorAccount") or {}
            if isinstance(debtor, str):
                payer_name = debtor
            elif isinstance(debtor, dict):
                payer_name = (
                    debtor.get("Name") or debtor.get("name") or debtor.get("fio") or ""
                ).strip()

        payer_phone_raw = (
            tx.get("payerPhone") or tx.get("payer_phone") or tx.get("PayerPhone") or ""
        ).strip()
        if not payer_phone_raw:
            debtor = tx.get("DebtorAgent") or tx.get("debtor") or tx.get("debtorAccount") or {}
            if isinstance(debtor, dict):
                payer_phone_raw = (
                    debtor.get("phone") or debtor.get("phoneNumber") or debtor.get("mobile") or ""
                ).strip()

        tx_date = (
            tx.get("bookingDate") or tx.get("documentProcessDate") or tx.get("BookingDateTime")
            or tx.get("date") or tx.get("valueDate") or tx.get("chargeDate") or ""
        )
        # Оставить только дату (YYYY-MM-DD), убрать время если есть
        if tx_date and "T" in str(tx_date):
            tx_date = str(tx_date).split("T")[0]

        operation_id = (
            tx.get("transactionId") or tx.get("TransactionId")
            or tx.get("instructionId") or tx.get("endToEndId")
            or tx.get("paymentId") or tx.get("id") or tx.get("transaction_id") or ""
        )
        if isinstance(operation_id, dict):
            operation_id = operation_id.get("id") or operation_id.get("value") or ""
        operation_id = str(operation_id).strip() if operation_id else ""

        description = (
            tx.get("description") or tx.get("Description")
            or tx.get("transactionTypeCode") or tx.get("paymentPurpose") or ""
        ).strip()

        result.append({
            "date": str(tx_date),
            "amount": amount_float,
            "direction": "income" if ind == "credit" else "expense",
            "payer_name": payer_name,
            "payer_phone_raw": payer_phone_raw,
            "operation_id": operation_id,
            "description": description,
            "raw": tx,
        })
    return result
