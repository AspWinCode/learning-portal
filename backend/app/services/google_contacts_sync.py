"""Односторонняя синхронизация контактов Google (People API) -> owner_workspace_contacts.

Поток строго Google -> система. Google владеет полями full_name/phone/email/city:
пустое поле с его стороны никогда не затирает заполненное поле в системе, а
непустое — всегда побеждает. Система владеет company/position/responsible_id/
status/tags/comment/counterparty_id и связанными задачами — синк их не трогает.

Синхронизируются только контакты из Google-группы GOOGLE_CONTACTS_GROUP_NAME
(по умолчанию "Школы"), сопоставление идёт по googleResourceName — он не
меняется при редактировании имени/телефона в Google.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, OwnerWorkspaceContact, OwnerWorkspaceNotification, OwnerWorkspaceTask

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/contacts.readonly"]
AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"

KEY_REFRESH_TOKEN = "google_contacts_refresh_token"
KEY_CONNECTED_USER_ID = "google_contacts_connected_user_id"
KEY_CONNECTED_AT = "google_contacts_connected_at"
KEY_SYNC_TOKEN = "google_contacts_sync_token"
KEY_LAST_SYNC_AT = "google_contacts_last_sync_at"
KEY_LAST_SYNC_STATS = "google_contacts_last_sync_stats"
KEY_LAST_SYNC_ERROR = "google_contacts_last_sync_error"
OAUTH_STATE_KEY_PREFIX = "google_contacts_oauth_state:"
OAUTH_STATE_TTL_MINUTES = 10

KIND_AUTH_FAILED = "google_contacts_auth_failed"


def _client_id() -> str:
    return (os.getenv("GOOGLE_CONTACTS_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.getenv("GOOGLE_CONTACTS_CLIENT_SECRET") or "").strip()


def _redirect_uri() -> str:
    return (os.getenv("GOOGLE_CONTACTS_REDIRECT_URI") or "").strip()


def _target_group_name() -> str:
    # Пусто = без фильтра по группе, синхронизируются все контакты аккаунта.
    return (os.getenv("GOOGLE_CONTACTS_GROUP_NAME") or "").strip()


def get_return_url() -> str:
    return (os.getenv("GOOGLE_CONTACTS_RETURN_URL") or "/owner-workspace/contacts").strip()


def is_configured() -> bool:
    return bool(_client_id() and _client_secret() and _redirect_uri())


def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    value = (row.value if row else None)
    return value if value not in (None, "") else None


def _set_setting(db: Session, key: str, value: Optional[str]) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if value is None:
        if row:
            db.delete(row)
        return
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def get_connection_status(db: Session) -> dict:
    refresh_token = _get_setting(db, KEY_REFRESH_TOKEN)
    stats_raw = _get_setting(db, KEY_LAST_SYNC_STATS)
    try:
        stats = json.loads(stats_raw) if stats_raw else None
    except Exception:
        stats = None
    connected_user_id = _get_setting(db, KEY_CONNECTED_USER_ID)
    return {
        "configured": is_configured(),
        "connected": bool(refresh_token),
        "connected_user_id": int(connected_user_id) if connected_user_id else None,
        "connected_at": _get_setting(db, KEY_CONNECTED_AT),
        "group_name": _target_group_name(),
        "last_sync_at": _get_setting(db, KEY_LAST_SYNC_AT),
        "last_sync_stats": stats,
        "last_sync_error": _get_setting(db, KEY_LAST_SYNC_ERROR),
    }


def build_consent_url(db: Session, user_id: int) -> str:
    if not is_configured():
        raise RuntimeError(
            "Google Contacts sync is not configured: set GOOGLE_CONTACTS_CLIENT_ID, "
            "GOOGLE_CONTACTS_CLIENT_SECRET and GOOGLE_CONTACTS_REDIRECT_URI"
        )
    from google_auth_oauthlib.flow import Flow

    state = secrets.token_urlsafe(24)
    # PKCE: google-auth-oauthlib generates the verifier on the Flow instance that
    # builds the auth URL, but the token exchange happens on a brand new Flow
    # instance in a later request — the verifier has to be carried across
    # ourselves via the stored OAuth state, or Google rejects the exchange with
    # "invalid_grant: Missing code verifier".
    code_verifier = secrets.token_urlsafe(96)[:128]
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    _set_setting(
        db,
        f"{OAUTH_STATE_KEY_PREFIX}{state}",
        json.dumps({"user_id": user_id, "expires_at": expires_at.isoformat(), "code_verifier": code_verifier}),
    )
    db.commit()

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "auth_uri": AUTH_URI,
                "token_uri": TOKEN_URI,
            }
        },
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
        code_verifier=code_verifier,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return auth_url


def consume_oauth_callback(db: Session, *, code: str, state: str) -> None:
    raw = _get_setting(db, f"{OAUTH_STATE_KEY_PREFIX}{state}")
    if not raw:
        raise ValueError("Unknown or expired OAuth state")
    _set_setting(db, f"{OAUTH_STATE_KEY_PREFIX}{state}", None)
    payload = json.loads(raw)
    expires_at = datetime.fromisoformat(payload["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        db.commit()
        raise ValueError("OAuth state expired, try connecting again")

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "auth_uri": AUTH_URI,
                "token_uri": TOKEN_URI,
            }
        },
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
        code_verifier=payload.get("code_verifier"),
    )
    flow.fetch_token(code=code)
    credentials = flow.credentials
    if not credentials.refresh_token:
        raise ValueError(
            "Google did not return a refresh token (account may already have an active grant); "
            "revoke access at https://myaccount.google.com/permissions and try again"
        )

    _set_setting(db, KEY_REFRESH_TOKEN, credentials.refresh_token)
    _set_setting(db, KEY_CONNECTED_USER_ID, str(payload["user_id"]))
    _set_setting(db, KEY_CONNECTED_AT, datetime.now(timezone.utc).isoformat())
    _set_setting(db, KEY_SYNC_TOKEN, None)
    _set_setting(db, KEY_LAST_SYNC_ERROR, None)
    db.commit()


def disconnect(db: Session) -> None:
    _set_setting(db, KEY_REFRESH_TOKEN, None)
    _set_setting(db, KEY_CONNECTED_USER_ID, None)
    _set_setting(db, KEY_CONNECTED_AT, None)
    _set_setting(db, KEY_SYNC_TOKEN, None)
    db.commit()


def _build_service(db: Session):
    refresh_token = _get_setting(db, KEY_REFRESH_TOKEN)
    if not refresh_token or not is_configured():
        return None
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=_client_id(),
        client_secret=_client_secret(),
        scopes=SCOPES,
    )
    return build("people", "v1", credentials=creds, cache_discovery=False)


def _find_target_group_id(service) -> Optional[str]:
    group_name = _target_group_name()
    if not group_name:
        return None
    groups = service.contactGroups().list(pageSize=200).execute(num_retries=5).get("contactGroups", [])
    for g in groups:
        if g.get("name") == group_name:
            return g["resourceName"]
    return None


@dataclass
class SyncStats:
    created: int = 0
    updated: int = 0
    archived: int = 0
    deleted: int = 0
    skipped: int = 0

    def as_dict(self) -> dict:
        return {
            "created": self.created,
            "updated": self.updated,
            "archived": self.archived,
            "deleted": self.deleted,
            "skipped": self.skipped,
        }


def _handle_removed(db: Session, resource_name: str, stats: SyncStats) -> None:
    contact = (
        db.query(OwnerWorkspaceContact)
        .filter(OwnerWorkspaceContact.google_resource_name == resource_name)
        .first()
    )
    if not contact:
        stats.skipped += 1
        return
    has_history = (
        db.query(OwnerWorkspaceTask.id).filter(OwnerWorkspaceTask.contact_id == contact.id).first()
        is not None
    )
    if has_history:
        contact.deleted_in_google = True
        contact.is_archived = True
        contact.archived_at = datetime.now(timezone.utc)
        stats.archived += 1
    else:
        db.delete(contact)
        stats.deleted += 1


def _upsert_contact(db: Session, person: dict, stats: SyncStats) -> None:
    resource_name = person["resourceName"]
    names = (person.get("names") or [{}])[0]
    phones = person.get("phoneNumbers") or []
    emails = person.get("emailAddresses") or []
    addresses = person.get("addresses") or []

    contact = (
        db.query(OwnerWorkspaceContact)
        .filter(OwnerWorkspaceContact.google_resource_name == resource_name)
        .first()
    )
    is_new = contact is None
    if contact is None:
        contact = OwnerWorkspaceContact(
            google_resource_name=resource_name,
            full_name=names.get("displayName") or "Без имени",
            type="individual",
            status="new",
        )
        db.add(contact)

    # Google побеждает, но только когда реально что-то прислал — пустое поле
    # с его стороны не затирает уже заполненное значение в системе.
    if names.get("displayName"):
        contact.full_name = names["displayName"]
    if phones and phones[0].get("value"):
        contact.phone = phones[0]["value"]
    if emails and emails[0].get("value"):
        contact.email = emails[0]["value"]
    if addresses and addresses[0].get("city"):
        contact.city = addresses[0]["city"]

    contact.google_etag = person.get("etag")
    contact.google_synced_at = datetime.now(timezone.utc)
    contact.deleted_in_google = False
    # company/position/responsible_id/status/tags/comment/counterparty_id —
    # принадлежат системе, синк их никогда не трогает.

    if is_new:
        stats.created += 1
    else:
        stats.updated += 1


def _run_sync_page(
    db: Session,
    service,
    group_id: Optional[str],
    group_filter_active: bool,
    sync_token: Optional[str],
    stats: SyncStats,
) -> Optional[str]:
    params = dict(
        resourceName="people/me",
        personFields="names,phoneNumbers,emailAddresses,addresses,memberships",
        requestSyncToken=True,
        pageSize=200,
    )
    if sync_token:
        params["syncToken"] = sync_token

    next_page_token = None
    new_sync_token = None
    while True:
        if next_page_token:
            params["pageToken"] = next_page_token
        resp = service.people().connections().list(**params).execute(num_retries=5)

        for person in resp.get("connections", []):
            resource_name = person["resourceName"]
            if person.get("metadata", {}).get("deleted"):
                _handle_removed(db, resource_name, stats)
                continue
            if group_filter_active:
                memberships = [
                    m["contactGroupMembership"]["contactGroupResourceName"]
                    for m in person.get("memberships", [])
                    if "contactGroupMembership" in m
                ]
                if group_id not in memberships:
                    _handle_removed(db, resource_name, stats)
                    continue
            _upsert_contact(db, person, stats)

        next_page_token = resp.get("nextPageToken")
        if not next_page_token:
            new_sync_token = resp.get("nextSyncToken")
            break
    return new_sync_token


def run_sync(db: Session) -> SyncStats:
    """Выполняет один цикл синхронизации. Поднимает исключение при ошибке авторизации."""
    service = _build_service(db)
    if service is None:
        raise RuntimeError("Google Contacts sync is not connected")

    group_name = _target_group_name()
    group_filter_active = bool(group_name)
    group_id = _find_target_group_id(service) if group_filter_active else None
    if group_filter_active and group_id is None:
        logger.warning(
            "Google Contacts: группа '%s' не найдена — ни один контакт не будет синхронизирован,"
            " пока группа не появится или GOOGLE_CONTACTS_GROUP_NAME не очищен",
            group_name,
        )
    sync_token = _get_setting(db, KEY_SYNC_TOKEN)
    stats = SyncStats()

    try:
        new_sync_token = _run_sync_page(db, service, group_id, group_filter_active, sync_token, stats)
    except Exception as exc:  # noqa: BLE001 - re-sync on expired token, re-raise otherwise
        message = str(exc)
        if sync_token and ("EXPIRED_SYNC_TOKEN" in message or "410" in message):
            logger.warning("Google Contacts syncToken expired, doing a full re-sync")
            _set_setting(db, KEY_SYNC_TOKEN, None)
            db.commit()
            stats = SyncStats()
            new_sync_token = _run_sync_page(db, service, group_id, group_filter_active, None, stats)
        else:
            raise

    _set_setting(db, KEY_SYNC_TOKEN, new_sync_token)
    _set_setting(db, KEY_LAST_SYNC_AT, datetime.now(timezone.utc).isoformat())
    _set_setting(db, KEY_LAST_SYNC_STATS, json.dumps(stats.as_dict()))
    _set_setting(db, KEY_LAST_SYNC_ERROR, None)
    db.commit()
    logger.info("Google Contacts sync done: %s", stats.as_dict())
    return stats


def _notify_auth_failed(db: Session, error_message: str) -> None:
    from app.services.owner_workspace_notifications import queue_notification

    connected_user_id = _get_setting(db, KEY_CONNECTED_USER_ID)
    if not connected_user_id:
        return
    user_id = int(connected_user_id)
    dedupe_key = f"google_contacts_auth_failed:{datetime.now(timezone.utc).date().isoformat()}"
    exists = (
        db.query(OwnerWorkspaceNotification.id)
        .filter(
            OwnerWorkspaceNotification.user_id == user_id,
            OwnerWorkspaceNotification.dedupe_key == dedupe_key,
        )
        .first()
    )
    if exists:
        return
    queue_notification(
        db,
        user_id=user_id,
        kind=KIND_AUTH_FAILED,
        title="Синхронизация с Google Контактами сломалась",
        body=(
            "Доступ к Google Контактам отозван или истёк. Переподключите аккаунт в "
            "разделе Контакты, иначе новые/изменённые контакты не будут приходить. "
            f"Ошибка: {error_message[:300]}"
        ),
        dedupe_key=dedupe_key,
    )
    db.commit()


NETWORK_RETRY_ATTEMPTS = 3
NETWORK_RETRY_DELAY_SECONDS = 4


def _is_transient_network_error(exc: Exception) -> bool:
    # Этот сервер видит периодические обрывы до googleapis.com/accounts.google.com
    # (ENETUNREACH / connect timeout) — не ошибка авторизации, а сетевая
    # нестабильность, которую стоит просто повторить через пару секунд.
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    return False


def run_sync_job(db: Session) -> None:
    """Обёртка для фонового планировщика: ловит ошибки и шлёт уведомление при обрыве авторизации."""
    if not is_configured():
        return
    if not _get_setting(db, KEY_REFRESH_TOKEN):
        return

    last_exc: Optional[Exception] = None
    for attempt in range(1, NETWORK_RETRY_ATTEMPTS + 1):
        try:
            run_sync(db)
            return
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            last_exc = exc
            if attempt < NETWORK_RETRY_ATTEMPTS and _is_transient_network_error(exc):
                logger.warning(
                    "Google Contacts sync: transient network error (попытка %d/%d), повтор через %ds: %s",
                    attempt,
                    NETWORK_RETRY_ATTEMPTS,
                    NETWORK_RETRY_DELAY_SECONDS,
                    exc,
                )
                time.sleep(NETWORK_RETRY_DELAY_SECONDS)
                continue
            break

    assert last_exc is not None
    message = str(last_exc)
    logger.error("Google Contacts sync failed", exc_info=last_exc)
    _set_setting(db, KEY_LAST_SYNC_ERROR, message[:2000])
    db.commit()
    is_auth_error = any(
        marker in message
        for marker in ("invalid_grant", "unauthorized_client", "401", "403", "invalid_rapt")
    )
    if is_auth_error:
        _notify_auth_failed(db, message)
