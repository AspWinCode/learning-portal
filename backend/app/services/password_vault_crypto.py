import base64
import hashlib
import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from app.auth import SECRET_KEY

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    configured_key = (os.getenv("PASSWORD_VAULT_KEY") or "").strip()
    if configured_key:
        try:
            return Fernet(configured_key.encode("utf-8"))
        except Exception as exc:
            raise RuntimeError("PASSWORD_VAULT_KEY must be a valid Fernet key") from exc

    logger.warning("PASSWORD_VAULT_KEY is not set; deriving password vault key from SECRET_KEY")
    digest = hashlib.sha256(SECRET_KEY.encode("utf-8")).digest()
    derived_key = base64.urlsafe_b64encode(digest)
    return Fernet(derived_key)


def encrypt_password(value: str) -> str:
    return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_password(value: str) -> str:
    try:
        return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password vault key cannot decrypt this entry",
        )

