import logging
import os
import time
from typing import Any

from fastapi import FastAPI
from sqlalchemy import event


logger = logging.getLogger(__name__)


def _env_enabled(name: str, default: str = "0") -> bool:
    return (os.getenv(name, default).strip().lower() in ("1", "true", "yes"))


def configure_sentry() -> None:
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning("Sentry DSN is configured, but sentry-sdk is not installed")
        return

    traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))
    environment = (os.getenv("APP_ENV") or "development").strip().lower()
    release = (os.getenv("APP_RELEASE") or "").strip() or None

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        traces_sample_rate=traces_sample_rate,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            SqlalchemyIntegration(),
        ],
        send_default_pii=False,
    )
    logger.info("Sentry backend integration enabled")


def configure_fastapi_observability(app: FastAPI) -> None:
    if not _env_enabled("METRICS_ENABLED", "1"):
        return

    try:
        from prometheus_fastapi_instrumentator import Instrumentator
    except Exception as exc:
        logger.warning("Metrics instrumentation is unavailable: %s", exc)
        return

    Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/api/v1/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.info("Prometheus metrics endpoint enabled at /metrics")


def configure_sqlalchemy_observability(engine: Any) -> None:
    slow_query_ms = int(os.getenv("DB_SLOW_QUERY_MS", "500"))
    db_checked_out_gauge = None
    try:
        from prometheus_client import Gauge

        db_checked_out_gauge = Gauge(
            "learning_portal_db_checked_out_connections",
            "Current number of checked-out SQLAlchemy connections",
        )
    except Exception:
        db_checked_out_gauge = None

    def _update_pool_gauge() -> None:
        if db_checked_out_gauge is None:
            return
        try:
            db_checked_out_gauge.set(engine.pool.checkedout())
        except Exception:
            logger.debug("Failed to update SQLAlchemy pool gauge", exc_info=True)

    if slow_query_ms <= 0:
        slow_query_enabled = False
    else:
        slow_query_enabled = True

    @event.listens_for(engine, "checkout")
    def checkout_listener(dbapi_connection, connection_record, connection_proxy):
        _update_pool_gauge()

    @event.listens_for(engine, "checkin")
    def checkin_listener(dbapi_connection, connection_record):
        _update_pool_gauge()

    if not slow_query_enabled:
        return

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        start_times = conn.info.get("query_start_time") or []
        if not start_times:
            return
        started_at = start_times.pop()
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        if elapsed_ms < slow_query_ms:
            return
        compact_sql = " ".join((statement or "").split())
        logger.warning(
            "Slow SQL query detected",
            extra={
                "duration_ms": round(elapsed_ms, 2),
                "threshold_ms": slow_query_ms,
                "statement": compact_sql[:1000],
            },
        )
