"""
Интеграция с мессенджером MAX.
- Режим «бот»: официальный API (platform-api.max.ru), сообщения от бота.
- Режим «личный аккаунт»:
  - GREEN-API (бесплатный тариф MAX Developer) — привязка и QR в ЛК console.green-api.com.
  - api-messenger.com (платный) — QR можно получить через наш API.
"""

import logging
import os
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)

MAX_MESSAGE_TEXT_LIMIT = 4000


# --- Официальный Bot API (platform-api.max.ru) ---

def _get_base_url() -> str:
    return (os.getenv("MAX_API_BASE_URL") or "https://platform-api.max.ru").strip().rstrip("/")


def _get_token() -> str:
    return (os.getenv("MAX_BOT_TOKEN") or "").strip()


def _is_bot_configured() -> bool:
    return bool(_get_base_url() and _get_token())


# --- Личный аккаунт: GREEN-API (бесплатно) или api-messenger.com (платно) ---

def _get_greenapi_base_url() -> str:
    return (os.getenv("GREEN_API_BASE_URL") or "").strip().rstrip("/")


def _get_greenapi_id_instance() -> str:
    return (os.getenv("GREEN_API_ID_INSTANCE") or "").strip()


def _get_greenapi_token() -> str:
    return (os.getenv("GREEN_API_TOKEN") or "").strip()


def _is_greenapi_configured() -> bool:
    return bool(_get_greenapi_base_url() and _get_greenapi_id_instance() and _get_greenapi_token())


def _get_personal_base_url() -> str:
    return (os.getenv("MAX_PERSONAL_BASE_URL") or "https://app.api-messenger.com/max-v1").strip().rstrip("/")


def _get_personal_token() -> str:
    return (os.getenv("MAX_PERSONAL_TOKEN") or "").strip()


def _is_api_messenger_configured() -> bool:
    return bool(_get_personal_base_url() and _get_personal_token())


def is_personal_configured() -> bool:
    return _is_greenapi_configured() or _is_api_messenger_configured()


def get_personal_provider() -> str:
    """Какой провайдер личного аккаунта используется: greenapi (бесплатно) или api_messenger."""
    if _is_greenapi_configured():
        return "greenapi"
    if _is_api_messenger_configured():
        return "api_messenger"
    return ""


def send_message_greenapi(chat_id: str, text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Отправить сообщение через GREEN-API (бесплатный тариф MAX Developer).
    chat_id — ID чата в MAX (user_id получателя как строка). Сообщение от личного аккаунта.
    """
    base_url = _get_greenapi_base_url()
    id_instance = _get_greenapi_id_instance()
    token = _get_greenapi_token()
    if not base_url or not id_instance or not token:
        return False, None, "GREEN-API не настроен"
    if not text or not text.strip():
        return False, None, "Текст сообщения пуст"
    text = text.strip()
    if len(text) > MAX_MESSAGE_TEXT_LIMIT:
        return False, None, f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов"
    url = f"{base_url}/waInstance{id_instance}/sendMessage/{token}"
    headers = {"Content-Type": "application/json"}
    payload = {"chatId": chat_id, "message": text}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.exception("max_greenapi: send failed chat_id=%s", chat_id)
        return False, None, str(e)
    if resp.status_code == 200:
        try:
            data = resp.json()
            msg_id = data.get("idMessage") if isinstance(data, dict) else None
            logger.info("max_greenapi_sent: chat_id=%s idMessage=%s", chat_id, msg_id)
            return True, str(msg_id) if msg_id else None, None
        except Exception:
            return True, None, None
    err_text = resp.text or resp.reason or str(resp.status_code)
    logger.warning("max_greenapi_failed: chat_id=%s status=%s body=%s", chat_id, resp.status_code, err_text[:200])
    return False, None, f"GREEN-API: {resp.status_code} — {err_text[:200]}"


def get_personal_qr() -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Получить QR-код для привязки личного MAX. Только для api-messenger.com.
    Для GREEN-API QR получают в ЛК console.green-api.com.
    """
    if _is_greenapi_configured():
        return False, None, "Для GREEN-API привязка и QR — в личном кабинете console.green-api.com"
    base_url = _get_personal_base_url()
    token = _get_personal_token()
    if not base_url or not token:
        return False, None, "MAX личный аккаунт не настроен (MAX_PERSONAL_TOKEN)"
    url = f"{base_url}/go"
    params = {"token": token}
    headers = {"Content-Type": "application/json; charset=utf-8"}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
    except requests.RequestException as e:
        logger.exception("max_personal: get QR failed")
        return False, None, str(e)
    if resp.status_code != 200:
        return False, None, f"Ошибка {resp.status_code}: {resp.text[:200]}"
    try:
        data = resp.json()
        if isinstance(data, dict) and data.get("status") == "OK" and data.get("img"):
            return True, data.get("img"), None
        return False, None, (data.get("message") if isinstance(data, dict) else None) or "QR не получен"
    except Exception:
        return False, None, "Неверный ответ сервера"


def send_message_personal(chat_id: str, text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Отправить сообщение из личного аккаунта. Используется GREEN-API (если настроен) или api-messenger.com.
    """
    if _is_greenapi_configured():
        return send_message_greenapi(chat_id, text)
    base_url = _get_personal_base_url()
    token = _get_personal_token()
    if not base_url or not token:
        logger.warning("max_messenger: MAX личный не настроен")
        return False, None, "MAX личный аккаунт не настроен"
    if not text or not text.strip():
        return False, None, "Текст сообщения пуст"
    text = text.strip()
    if len(text) > MAX_MESSAGE_TEXT_LIMIT:
        return False, None, f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов"
    url = f"{base_url}/sendMessage"
    params = {"token": token}
    headers = {"Content-Type": "application/json; charset=utf-8"}
    payload = [{"chatId": chat_id, "message": text}]
    try:
        resp = requests.post(url, params=params, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.exception("max_personal: send failed chat_id=%s", chat_id)
        return False, None, str(e)
    if resp.status_code in (200, 201):
        try:
            data = resp.json()
            if isinstance(data, dict) and data.get("status") == "OK":
                logger.info("max_personal_sent: chat_id=%s", chat_id)
                return True, None, None
            msg = data.get("message", "") if isinstance(data, dict) else resp.text
            return False, None, msg[:300]
        except Exception:
            return True, None, None
    err_text = resp.text or resp.reason or str(resp.status_code)
    logger.warning("max_personal_failed: chat_id=%s status=%s body=%s", chat_id, resp.status_code, err_text[:200])
    return False, None, f"MAX: {resp.status_code} — {err_text[:200]}"


def is_configured() -> bool:
    """Настроен хотя бы один способ: бот или личный аккаунт."""
    return _is_bot_configured() or is_personal_configured()


def send_message(user_id: int, text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Отправить сообщение пользователю в MAX по его user_id.
    Возвращает (success, message_id, error_message).
    """
    base_url = _get_base_url()
    token = _get_token()
    if not base_url or not token:
        logger.warning("max_messenger: MAX не настроен (MAX_API_BASE_URL или MAX_BOT_TOKEN)")
        return False, None, "MAX не настроен"

    if not text or not text.strip():
        return False, None, "Текст сообщения пуст"
    text = text.strip()
    if len(text) > MAX_MESSAGE_TEXT_LIMIT:
        return False, None, f"Текст не более {MAX_MESSAGE_TEXT_LIMIT} символов"

    url = f"{base_url}/messages"
    params = {"user_id": user_id}
    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
    }
    payload = {"text": text}

    try:
        resp = requests.post(url, params=params, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.exception("max_messenger: request failed user_id=%s", user_id)
        return False, None, str(e)

    if resp.status_code in (200, 201):
        try:
            data = resp.json()
            msg = data.get("message") if isinstance(data, dict) else None
            message_id = None
            if isinstance(msg, dict) and "message_id" in msg:
                message_id = str(msg["message_id"])
            elif isinstance(data, dict) and "message_id" in data:
                message_id = str(data["message_id"])
            logger.info("max_sent: user_id=%s message_id=%s", user_id, message_id)
            return True, message_id, None
        except Exception:
            return True, None, None

    err_text = resp.text or resp.reason or str(resp.status_code)
    logger.warning("max_failed: user_id=%s status=%s body=%s", user_id, resp.status_code, err_text[:200])
    return False, None, f"MAX: {resp.status_code} — {err_text[:200]}"
