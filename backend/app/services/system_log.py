from __future__ import annotations

import logging

from app.database import async_session_factory
from app.models import SystemLog

logger = logging.getLogger("resumecraft")

MESSAGE_MAX_LENGTH = 500


async def record_system_log(
    *,
    message: str,
    level: str = "error",
    source: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
    detail: str | None = None,
) -> None:
    """Persist a system log entry.

    Uses its own session so it works even when the request session is in a
    failed transaction, and never raises so logging cannot break a response.
    """
    try:
        async with async_session_factory() as session:
            session.add(
                SystemLog(
                    level=level,
                    message=message[:MESSAGE_MAX_LENGTH],
                    source=source,
                    method=method,
                    status_code=status_code,
                    detail=detail,
                )
            )
            await session.commit()
    except Exception:  # noqa: BLE001 - logging must never break the app
        logger.exception("Failed to write system log entry")
