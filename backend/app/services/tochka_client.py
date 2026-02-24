"""
Клиент API Точка Банк (https://developers.tochka.com/).
Получение токена и выписок по счёту для привязки входящих платежей к карточкам учеников.
Учётные данные задаются через переменные окружения: TOCHKA_CLIENT_ID, TOCHKA_CLIENT_SECRET.
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
TOCHKA_SANDBOX_BASE = "https://enter.tochka.com/sandbox/v2/"


def _get_credentials() -> tuple[str, str]:
    client_id = (os.getenv("TOCHKA_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("TOCHKA_CLIENT_SECRET") or "").strip()
    return client_id, client_secret


def is_configured() -> bool:
    """Проверка, заданы ли учётные данные Точка Банк в окружении."""
    client_id, client_secret = _get_credentials()
    return bool(client_id and client_secret)


def is_auto_import_configured() -> bool:
    """Проверка, включено ли автозачисление: заданы CLIENT_ID, CLIENT_SECRET и TOCHKA_ACCOUNT_ID."""
    if not is_configured():
        return False
    account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    return bool(account_id)


def get_access_token(use_sandbox: bool = False) -> str:
    """
    Получить OAuth2 access token (client_credentials).
    Scope: ReadStatements для выписок.
    """
    client_id, client_secret = _get_credentials()
    if not client_id or not client_secret:
        raise ValueError("TOCHKA_CLIENT_ID и TOCHKA_CLIENT_SECRET должны быть заданы в .env")

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
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = {}
        try:
            body = json.loads(e.read().decode())
        except Exception:
            pass
        raise ValueError(f"Точка Банк: ошибка получения токена ({e.code}): {body.get('error_description', body)}")

    token = body.get("access_token")
    if not token:
        raise ValueError("Точка Банк: в ответе нет access_token")
    return token


def _api_request(
    method: str,
    path: str,
    token: str,
    body: Optional[Dict[str, Any]] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    base = base_url or TOCHKA_API_BASE
    url = base.rstrip("/") + "/" + path.lstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def init_statement(account_id: str, date_from: date, date_to: date, token: str) -> str:
    """
    Запросить создание выписки за период. Возвращает statementId.
    Выписка формируется асинхронно (статусы: Created → Processing → Ready).
    """
    path = "open-banking/v1.0/statements"
    body = {
        "accountId": account_id,
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
    }
    resp = _api_request("POST", path, token, body=body)
    st_id = resp.get("statementId")
    if not st_id:
        raise ValueError(f"Точка Банк: в ответе Init Statement нет statementId: {resp}")
    return st_id


def get_statement(account_id: str, statement_id: str, token: str) -> Dict[str, Any]:
    """Получить выписку по statementId. Вызывать после того, как статус выписки стал Ready."""
    path = f"open-banking/v1.0/accounts/{account_id}/statements/{statement_id}"
    return _api_request("GET", path, token)


def get_statements_list(token: str) -> List[Dict[str, Any]]:
    """Список доступных выписок (для проверки статуса)."""
    path = "open-banking/v1.0/statements"
    resp = _api_request("GET", path, token)
    return resp.get("statements") or resp.get("data") or []


def fetch_statement_ready(
    account_id: str,
    date_from: date,
    date_to: date,
    token: Optional[str] = None,
    poll_interval_sec: float = 2.0,
    max_wait_sec: float = 120.0,
) -> Dict[str, Any]:
    """
    Запросить выписку и дождаться статуса Ready, затем вернуть её тело.
    account_id можно взять из списка счетов API или задать в TOCHKA_ACCOUNT_ID.
    """
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
    """
    Из тела выписки извлечь входящие операции (приход).
    В выписке Точка: creditDebitIndicator == 'credit' — приход.
    Плательщик может быть в debtor / name / payer / sidePayer (зависит от версии API).
    """
    transactions = []
    for key in ("transactions", "transactionList", "data", "operations"):
        if key in statement and isinstance(statement[key], list):
            transactions = statement[key]
            break
    # вложенная структура (statement.transactions)
    st_inner = statement.get("statement") or statement.get("data")
    if not transactions and isinstance(st_inner, dict):
        for key in ("transactions", "transactionList", "operations"):
            if key in st_inner and isinstance(st_inner[key], list):
                transactions = st_inner[key]
                break

    result = []
    for tx in transactions:
        ind = (tx.get("creditDebitIndicator") or tx.get("credit_debit_indicator") or "").lower()
        if ind != "credit":
            continue
        amount = tx.get("amount") or tx.get("amountNat") or tx.get("transactionAmount", {}).get("amount")
        if amount is None:
            continue
        try:
            amount_float = float(amount)
        except (TypeError, ValueError):
            continue
        # ФИО/имя плательщика (в приходе плательщик — debtor)
        debtor = tx.get("debtor") or tx.get("debtorAccount") or {}
        if isinstance(debtor, str):
            payer_name = debtor
        else:
            payer_name = (
                debtor.get("name")
                or debtor.get("fio")
                or debtor.get("displayName")
                or tx.get("payerName")
                or tx.get("payer_name")
                or ""
            )
        # Телефон плательщика (если банк отдаёт в выписке)
        payer_phone_raw = ""
        if isinstance(debtor, dict):
            payer_phone_raw = (
                debtor.get("phone")
                or debtor.get("phoneNumber")
                or debtor.get("mobile")
                or debtor.get("contact")
                or ""
            )
        if not payer_phone_raw:
            payer_phone_raw = tx.get("payerPhone") or tx.get("payer_phone") or tx.get("remitterPhone") or ""
        tx_date = tx.get("bookingDate") or tx.get("date") or tx.get("valueDate") or tx.get("chargeDate") or ""
        # Уникальный идентификатор операции (дедупликация)
        operation_id = (
            tx.get("transactionId")
            or tx.get("instructionId")
            or tx.get("endToEndId")
            or tx.get("id")
            or tx.get("transaction_id")
        )
        if isinstance(operation_id, dict):
            operation_id = operation_id.get("id") or operation_id.get("value") or ""
        operation_id = str(operation_id).strip() if operation_id else ""
        result.append({
            "date": tx_date,
            "amount": amount_float,
            "payer_name": (payer_name or "").strip(),
            "payer_phone_raw": (payer_phone_raw or "").strip(),
            "operation_id": operation_id,
            "raw": tx,
        })
    return result
