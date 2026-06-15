import dramatiq
from dramatiq.brokers.redis import RedisBroker

from app import background_tasks  # noqa: F401 - importing registers actors with the configured broker.


def test_background_tasks_use_redis_broker():
    assert isinstance(dramatiq.get_broker(), RedisBroker)
