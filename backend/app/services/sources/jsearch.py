from __future__ import annotations

from datetime import datetime

import httpx

from app.config import settings
from app.services.sources.base import JobSource, NormalizedJob


class JSearchSource(JobSource):
    """JSearch aggregator via RapidAPI (bundles Google Jobs, LinkedIn, etc.)."""

    name = "jsearch"

    def enabled(self) -> bool:
        return bool(settings.rapidapi_key)

    async def search(
        self, query: str, location: str | None, limit: int
    ) -> list[NormalizedJob]:
        if not self.enabled():
            return []

        search_query = f"{query} in {location}" if location else query
        # JSearch returns ~10 results per page; request enough pages for the limit.
        num_pages = max(1, min((limit + 9) // 10, 10))
        params = {
            "query": search_query,
            "page": "1",
            "num_pages": str(num_pages),
            "country": "us",
            "date_posted": "all",
        }
        headers = {
            "X-RapidAPI-Key": settings.rapidapi_key,
            "X-RapidAPI-Host": settings.jsearch_host,
        }
        url = f"https://{settings.jsearch_host}/search-v2"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        # /search-v2 nests results under data.data.jobs
        payload = data.get("data") or {}
        items = payload.get("jobs", [])[:limit]
        return [self._normalize(item) for item in items]

    def _normalize(self, item: dict) -> NormalizedJob:
        posted_at = None
        if ts := item.get("job_posted_at_timestamp"):
            try:
                posted_at = datetime.fromtimestamp(int(ts))
            except (ValueError, TypeError):
                posted_at = None

        location_parts = [
            item.get("job_city"),
            item.get("job_state"),
            item.get("job_country"),
        ]
        location = ", ".join(p for p in location_parts if p) or None

        return NormalizedJob(
            source=self.name,
            external_id=str(item.get("job_id")),
            url=item.get("job_apply_link") or item.get("job_google_link", ""),
            title=item.get("job_title", ""),
            company=item.get("employer_name"),
            location=location,
            description=item.get("job_description"),
            salary_min=item.get("job_min_salary"),
            salary_max=item.get("job_max_salary"),
            currency=item.get("job_salary_currency"),
            employment_type=item.get("job_employment_type"),
            category=item.get("job_category"),
            posted_at=posted_at,
            raw=item,
        )
