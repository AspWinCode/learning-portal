"""
Redis cache helpers for fastapi-cache2.

Redis db=0 — Dramatiq broker (existing)
Redis db=1 — HTTP response cache (this module)
"""
from fastapi_cache import FastAPICache

CACHE_NS_PROGRAMS = "programs"
CACHE_NS_GROUPS = "groups"
CACHE_NS_ABONEMENTS = "abonements"
CACHE_NS_PARENT_DASHBOARD = "parent_dashboard"


def user_role_key_builder(func, namespace="", *, request=None, response=None, args=(), kwargs={}):
    """Per-user, per-role cache key (role-filtered list endpoints)."""
    user = kwargs.get("current_user")
    user_id = getattr(user, "id", "anon")
    role = getattr(getattr(user, "role", None), "value", str(getattr(user, "role", "anon")))
    skip = kwargs.get("skip", 0)
    limit = kwargs.get("limit", 100)
    prefix = FastAPICache.get_prefix()
    return f"{prefix}:{namespace}:{func.__name__}:{user_id}:{role}:{skip}:{limit}"


def shared_key_builder(func, namespace="", *, request=None, response=None, args=(), kwargs={}):
    """Shared cache key for data that's identical for all users."""
    status_filter = getattr(kwargs.get("status_filter"), "value", kwargs.get("status_filter", ""))
    skip = kwargs.get("skip", 0)
    limit = kwargs.get("limit", 100)
    prefix = FastAPICache.get_prefix()
    return f"{prefix}:{namespace}:{func.__name__}:{status_filter}:{skip}:{limit}"


async def invalidate_namespace(namespace: str) -> None:
    """Delete all cache keys under a namespace. Fire-and-forget safe."""
    try:
        backend = FastAPICache.get_backend()
        redis = backend.redis
        pattern = f"{FastAPICache.get_prefix()}:{namespace}:*"
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
    except Exception:
        pass
