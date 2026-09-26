from datetime import datetime, timezone
from typing import Optional


def utcnow() -> datetime:
    """Return naive UTC datetime for compatibility with legacy DB fields."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Strip tzinfo so timestamptz columns can be compared with utcnow()."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
