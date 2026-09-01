"""Файловое хранилище материалов базы знаний.

Физически переиспользуем тот же том, что и модуль disk (DISK_STORAGE_ROOT,
volume disk_storage), но в отдельном подкаталоге ``academy/`` и без записей
DiskItem — материалы БЗ отслеживаются полем AcademyKbEntry.storage_key.
"""
import base64
import os
import re
from pathlib import Path
from typing import Optional
from uuid import uuid4

_DISK_ROOT = Path(os.getenv("DISK_STORAGE_ROOT", "/app/storage/disk")).resolve()
ACADEMY_STORAGE_ROOT = (_DISK_ROOT / "academy").resolve()

MAX_UPLOAD_BYTES = int(os.getenv("ACADEMY_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))


def _safe_name(value: str, fallback: str = "file") -> str:
    name = re.sub(r"[\r\n\t/\\]+", " ", str(value or "")).strip()
    return (name or fallback)[:200]


def _ensure_root() -> None:
    ACADEMY_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def resolve_path(storage_key: str) -> Path:
    path = (ACADEMY_STORAGE_ROOT / storage_key).resolve()
    if ACADEMY_STORAGE_ROOT not in path.parents:
        raise ValueError("Invalid storage key")
    return path


def save_bytes(data: bytes, filename: str) -> str:
    """Сохраняет файл, возвращает storage_key (относительно academy-root)."""
    if not data:
        raise ValueError("Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(f"Max upload size is {MAX_UPLOAD_BYTES} bytes")
    _ensure_root()
    storage_key = f"{uuid4().hex}_{_safe_name(filename)}"
    resolve_path(storage_key).write_bytes(data)
    return storage_key


def read_bytes(storage_key: str) -> Optional[bytes]:
    path = resolve_path(storage_key)
    if not path.exists():
        return None
    return path.read_bytes()


def delete(storage_key: str) -> None:
    try:
        path = resolve_path(storage_key)
    except ValueError:
        return
    if path.exists():
        path.unlink()


def as_data_uri(storage_key: str, content_type: str) -> Optional[str]:
    """data:-URI файла — для передачи картинки в vision-модель через ai_gateway."""
    data = read_bytes(storage_key)
    if data is None:
        return None
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{content_type or 'application/octet-stream'};base64,{encoded}"
