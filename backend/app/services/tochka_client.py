"""
Клиент API Точка Банк (https://developers.tochka.com/).
Поддерживает JWT assertion аутентификацию (новый формат):
  TOCHKA_CLIENT_ID  — идентификатор приложения
  TOCHKA_JWT_TOKEN  — pre-signed JWT (client_assertion)
  TOCHKA_ACCOUNT_ID — номер расчётного счёта (20 цифр или UUID)
"""
import os
import time
import json
import urllib.request
import urllib.error
import urllib.parse
import base64
from typing import Optional, List, Dict, Any
from datetime import date


TOCHKA_TOKEN_URL = "https://enter.tochka.com/connect/token"
TOCHKA_API_BASE = "https://enter.tochka.com/uapi/"


def _get_credentials() -> tuple[str, str, str]:
    client_id = (os.getenv("TOCHKA_CLIENT_ID") or "").strip()
    jwt_token = (os.getenv("TOCHKA_JWT_TOKEN") or "").strip()
    # fallback: старый client_secret если JWT нет
    client_secret = (os.getenv("TOCHKA_CLIENT_SECRET") or "").strip()
    return client_id, jwt_token, client_secret


def is_configured() -> bool:
    client_id, jwt_token, client_secret = _get_credentials()
    return bool(client_id and (jwt_token or client_secret))


def is_auto_import_configured() -> bool:
    if not is_configured():
        return False
    account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    return bool(account_id)


def get_access_token() -> str:
    """
    Получить OAuth2 access token.
    Приоритет: JWT assertion (новый) → Basic client_credentials (старый).
    """
    client_id, jwt_token, client_secret = _get_credentials()
    if not client_id:
        raise ValueError("TOCHKA_CLIENT_ID не задан")

    if jwt_token:
        # Новый формат: JWT Bearer assertion
        data = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": jwt_token,
            "scope": "ReadStatements ReadBalances ReadAccountsBasic",
        }).encode("utf-8")
        req = urllib.request.Request(
            TOCHKA_TOKEN_URL,
            data=data,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    elif client_secret:
        # Старый формат: Basic auth
        data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "scope": "ReadStatements ReadBalances ReadAccountsBasic",
        }).encode("utf-8")
        auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        req = urllib.request.Request(
            TOCHKA_TOKEN_URL,
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {auth}",
            },
        )
    else:
        raise ValueError("Нет TOCHKA_JWT_TOKEN или TOCHKA_CLIENT_SECRET")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = {}
        try:
            body = json.loads(e.read().decode())
        except Exception:
            pass
        raise ValueError(f"Точка Банк: ошибка получения токена ({e.code}): {body}")

    token = body.get("access_token")
    if not token:
        raise ValueError(f"Точка Банк: нет access_token в ответе: {body}")
    return token


def _api_request(
    method: str,
    path: str,
    token: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    url = TOCHKA_API_BASE.rstrip("/") + "/" + path.lstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_err = {}
        try:
            body_err = json.loads(e.read().decode())
        except Exception:
            pass
        raise ValueError(f"Точка API {method} {path}: {e.code} {body_err}")


def get_accounts(token: str) -> List[Dict[str, Any]]:
    """Список счетов клиента."""
    resp = _api_request("GET", "open-banking/v1.0/accounts", token)
    return resp.get("accounts") or resp.get("data") or []


def init_statement(account_id: str, date_from: date, date_to: date, token: str) -> str:
    """Запросить создание выписки. Возвращает statementId."""
    resp = _api_request("POST", "open-banking/v1.0/statements", token, body={
        "accountId": account_id,
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
    })
    st_id = resp.get("statementId")
    if not st_id:
        raise ValueError(f"Точка Банк: нет statementId в ответе: {resp}")
    return st_id


def get_statement(account_id: str, statement_id: str, token: str) -> Dict[str, Any]:
    """Получить выписку по statementId."""
    return _api_request("GET", f"open-banking/v1.0/accounts/{account_id}/statements/{statement_id}", token)


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
    st_id = init_statement(account_id, date_from, date_to, token)
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        time.sleep(poll_interval_sec)
        st = get_statement(account_id, st_id, token)
        status = (st.get("status") or st.get("statement", {}).get("status") or "").lower()
        if status == "ready":
            return st
        if status in ("failed", "error", "cancelled"):
            raise ValueError(f"Точка Банк: выписка не создана, статус {status}")
    raise TimeoutError("Точка Банк: выписка не готова за отведённое время")


def extract_incoming_transactions(statement: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Из тела выписки извлечь все операции (приход и расход)."""
    transactions = []
    for key in ("transactions", "transactionList", "data", "operations"):
        if key in statement and isinstance(statement[key], list):
            transactions = statement[key]
            break
    st_inner = statement.get("statement") or statement.get("data")
    if not transactions and isinstance(st_inner, dict):
        for key in ("transactions", "transactionList", "operations"):
            if key in st_inner and isinstance(st_inner[key], list):
                transactions = st_inner[key]
                break

    result = []
    for tx in transactions:
        ind = (tx.get("creditDebitIndicator") or tx.get("credit_debit_indicator") or "").lower()
        amount = tx.get("amount") or tx.get("amountNat") or tx.get("transactionAmount", {}).get("amount")
        if amount is None:
            continue
        try:
            amount_float = float(amount)
        except (TypeError, ValueError):
            continue

        debtor = tx.get("debtor") or tx.get("debtorAccount") or {}
        if isinstance(debtor, str):
            payer_name = debtor
        else:
            payer_name = (
                debtor.get("name") or debtor.get("fio") or debtor.get("displayName")
                or tx.get("payerName") or tx.get("payer_name") or ""
            )
        payer_phone_raw = ""
        if isinstance(debtor, dict):
            payer_phone_raw = (
                debtor.get("phone") or debtor.get("phoneNumber")
                or debtor.get("mobile") or debtor.get("contact") or ""
            )
        if not payer_phone_raw:
            payer_phone_raw = tx.get("payerPhone") or tx.get("payer_phone") or ""

        tx_date = tx.get("bookingDate") or tx.get("date") or tx.get("valueDate") or tx.get("chargeDate") or ""
        operation_id = (
            tx.get("transactionId") or tx.get("instructionId")
            or tx.get("endToEndId") or tx.get("id") or tx.get("transaction_id")
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
