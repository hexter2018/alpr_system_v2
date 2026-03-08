"""
logging_config.py — Structured JSON logging for production.

Call ``configure_logging()`` once at application startup (in main.py).

When ``settings.log_json`` is True (production default), every log record
is emitted as a single JSON line with fields:
    ts        ISO-8601 timestamp (UTC)
    level     DEBUG / INFO / WARNING / ERROR / CRITICAL
    logger    logger name
    message   formatted log message
    *         any extra kwargs passed to the log call

When ``settings.log_json`` is False (development), standard coloured
uvicorn-style text output is used instead.
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        log_object: dict[str, Any] = {
            "ts":      datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }

        # Include exception info if present
        if record.exc_info:
            log_object["exc"] = self.formatException(record.exc_info)

        # Include any extra fields attached via `extra={...}` or `logger.info(..., key=val)`
        skip = {
            "msg", "args", "created", "filename", "funcName", "levelname",
            "levelno", "lineno", "message", "module", "msecs", "name",
            "pathname", "process", "processName", "relativeCreated",
            "stack_info", "thread", "threadName", "exc_info", "exc_text",
            "taskName",
        }
        for key, value in record.__dict__.items():
            if key not in skip:
                log_object[key] = value

        return json.dumps(log_object, default=str, ensure_ascii=False)


def configure_logging(log_json: bool = True) -> None:
    """
    Configure root logger + uvicorn loggers.

    Call once at application startup, e.g.::

        from app.core.logging_config import configure_logging
        configure_logging(log_json=settings.log_json)
    """
    handler = logging.StreamHandler(sys.stdout)

    if log_json:
        handler.setFormatter(JsonFormatter())
    else:
        # Plain-text for development: keep uvicorn's default formatting
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    # Apply to root logger
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Ensure uvicorn loggers also use our handler
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "celery"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.addHandler(handler)
        lg.propagate = False
        lg.setLevel(logging.INFO)
