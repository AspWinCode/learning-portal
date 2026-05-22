import logging
import os
from logging.config import dictConfig


def configure_logging() -> None:
    level = (os.getenv("LOG_LEVEL") or "INFO").upper()
    log_format = (os.getenv("LOG_FORMAT") or "plain").lower().strip()

    if log_format == "json":
        formatter = {
            "format": '{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}'
        }
    else:
        formatter = {
            "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s"
        }

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": formatter,
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "level": level,
                }
            },
            "root": {
                "handlers": ["default"],
                "level": level,
            },
        }
    )
    logging.getLogger(__name__).debug("Logging configured", extra={"log_format": log_format})
