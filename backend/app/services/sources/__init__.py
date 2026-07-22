from __future__ import annotations

import asyncio

from app.services.sources.adzuna import AdzunaSource
from app.services.sources.base import JobSource, NormalizedJob
from app.services.sources.jsearch import JSearchSource

_SOURCES: dict[str, JobSource] = {
    AdzunaSource.name: AdzunaSource(),
    JSearchSource.name: JSearchSource(),
}


def available_sources() -> list[str]:
    return [name for name, src in _SOURCES.items() if src.enabled()]


async def search_all(
    query: str,
    location: str | None,
    limit: int,
    sources: list[str],
) -> list[NormalizedJob]:
    """Query the selected sources concurrently and merge the results."""
    selected = [_SOURCES[name] for name in sources if name in _SOURCES]

    async def _safe_search(src: JobSource) -> list[NormalizedJob]:
        try:
            return await src.search(query, location, limit)
        except Exception:  # noqa: BLE001 - one failing source shouldn't abort all
            return []

    results = await asyncio.gather(*(_safe_search(s) for s in selected))
    return [job for batch in results for job in batch]
