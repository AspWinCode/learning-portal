from __future__ import annotations

import os

import dramatiq
from dramatiq.brokers.redis import RedisBroker


def build_broker() -> RedisBroker:
    redis_url = (os.getenv("REDIS_URL") or "redis://redis:6379/0").strip()
    return RedisBroker(url=redis_url)


broker = build_broker()
dramatiq.set_broker(broker)
