from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return naive UTC datetime for compatibility with legacy DB fields."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
