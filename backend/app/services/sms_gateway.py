"""
Интеграция с SMS Gateway (Android-приложение).
Поддерживаются: InfiniReach (api.infinireach.io), другие — generic-формат.
"""

import logging
import os
import time
from typing import Optional, Tuple, List

import requests

logger = logging.getLogger(__name__)

SMS_MAX_LENGTH = 500
E164_PATTERN = r"^\+[1-9]\d{1,14}$"

# Провайдер: infinireach | пусто (generic)
def _get_provider() -> str:
    return (os.getenv("SMS_GATEWAY_PROVIDER") or "").strip().lower()


def _get_base_url() -> str:
    return (os.getenv("SMS_GATEWAY_BASE_URL") or "").strip().rstrip("/")


def _get_token() -> str:
    return (os.getenv("SMS_GATEWAY_TOKEN") or "").strip()


def _get_device_id() -> str:
    return (os.getenv("SMS_GATEWAY_DEVICE_ID") or "").strip()


def _get_from_number() -> str:
    """Номер отправителя (для InfiniReach — обязателен: зарегистрированное устройство)."""
    return (os.getenv("SMS_GATEWAY_FROM") or "").strip()


def _get_send_path() -> str:
    """Путь к эндпоинту отправки."""
    return (os.getenv("SMS_GATEWAY_SEND_PATH") or "").strip().lstrip("/")


def _use_infinireach() -> bool:
    """Использовать InfiniReach API: явно SMS_GATEWAY_PROVIDER=infinireach или base_url содержит infinireach.io."""
    if _get_provider() == "infinireach":
        return True
    base_url = _get_base_url()
    return "infinireach.io" in base_url.lower() and bool(_get_from_number())


def is_configured() -> bool:
    """Проверка, что gateway настроен."""
    base_url = _get_base_url()
    token = _get_token()
    if not base_url or not token:
        return False
    if _use_infinireach():
        return bool(_get_from_number())
    return True


def _send_sms_infinireach(phone: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Отправка через InfiniReach API: POST /api/v1/messages, X-API-Key, body to/message/from/channel."""
    base_url = _get_base_url().rstrip("/")
    url = f"{base_url}/api/v1/messages"
    headers = {
        "X-API-Key": _get_token(),
        "Content-Type": "application/json",
    }
    payload = {
        "to": phone,
        "message": message,
        "from": _get_from_number(),
        "channel": "sms",
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.exception("sms_gateway_error: request failed phone=%s", phone)
        return False, None, str(e)
    if resp.status_code in (200, 201, 202):
        try:
            data = resp.json()
            gateway_id = (data.get("messageId") or data.get("jobId") or data.get("id")) if isinstance(data, dict) else None
            logger.info("sms_sent: phone=%s gateway_id=%s", phone, gateway_id)
            return True, str(gateway_id) if gateway_id else None, None
        except Exception:
            return True, None, None
    err_text = resp.text or resp.reason or str(resp.status_code)
    logger.warning("sms_failed: phone=%s status=%s body=%s", phone, resp.status_code, err_text[:200])
    return False, None, f"Gateway: {resp.status_code} — {err_text[:200]}"


def _send_sms_generic(phone: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Generic: Bearer token, phoneNumbers + textMessage (или свой путь через SMS_GATEWAY_SEND_PATH)."""
    base_url = _get_base_url().rstrip("/")
    path = _get_send_path() or "3rdparty/v1/messages"
    url = f"{base_url}/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {_get_token()}",
        "Content-Type": "application/json",
    }
    payload = {
        "phoneNumbers": [phone],
        "textMessage": {"text": message},
    }
    device_id = _get_device_id()
    if device_id:
        payload["deviceId"] = device_id
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.exception("sms_gateway_error: request failed phone=%s", phone)
        return False, None, str(e)
    if resp.status_code in (200, 201, 202):
        try:
            data = resp.json()
            gateway_id = data.get("id") or data.get("messageId") or data.get("message_id") if isinstance(data, dict) else None
            logger.info("sms_sent: phone=%s gateway_id=%s", phone, gateway_id)
            return True, str(gateway_id) if gateway_id else None, None
        except Exception:
            return True, None, None
    err_text = resp.text or resp.reason or str(resp.status_code)
    logger.warning("sms_failed: phone=%s status=%s body=%s", phone, resp.status_code, err_text[:200])
    return False, None, f"Gateway: {resp.status_code} — {err_text[:200]}"


def send_sms(phone: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Отправить одно SMS через API SMS Gateway.
    Возвращает (success, gateway_id, error_message).
    """
    if not is_configured():
        logger.warning("sms_gateway_error: SMS Gateway not configured")
        return False, None, "SMS Gateway не настроен"
    if len(message) > SMS_MAX_LENGTH:
        return False, None, f"Текст сообщения не более {SMS_MAX_LENGTH} символов"
    if _use_infinireach():
        return _send_sms_infinireach(phone, message)
    return _send_sms_generic(phone, message)


def send_bulk_sms(
    phones: List[str],
    message: str,
    delay_seconds: float = 61.0,
) -> List[Tuple[str, bool, Optional[str], Optional[str]]]:
    """
    Отправить SMS на несколько номеров с паузой между отправками (ограничение 1 SMS / 60 сек на номер).
    Возвращает список (phone, success, gateway_id, error) для каждого номера.
    """
    results = []
    for i, phone in enumerate(phones):
        if i > 0:
            time.sleep(delay_seconds)
        ok, gid, err = send_sms(phone, message)
        results.append((phone, ok, gid, err))
    return results


def handle_webhook(payload: dict) -> None:
    """
    Обработка webhook от SMS Gateway (доставка, ошибка).
    Можно вызывать из роутера при приёме POST от gateway.
    """
    logger.info("sms_webhook: %s", payload)
    # При необходимости обновлять sms_messages.sent_at / status по gateway_id
    # и логировать sms_sent / sms_failed
    pass
