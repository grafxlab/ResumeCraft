from __future__ import annotations

from datetime import datetime

import httpx

from app.config import settings
from app.services.sources.base import JobSource, NormalizedJob

BASE_URL = "https://api.adzuna.com/v1/api/jobs"


class AdzunaSource(JobSource):
    name = "adzuna"

    def enabled(self) -> bool:
        return bool(settings.adzuna_app_id and settings.adzuna_app_key)

    async def search(
        self, query: str, location: str | None, limit: int
    ) -> list[NormalizedJob]:
        if not self.enabled():
            return []

        country = settings.adzuna_country
        # Adzuna paginates 50 results max per page; page index starts at 1.
        per_page = min(limit, 50)
        params = {
            "app_id": settings.adzuna_app_id,
            "app_key": settings.adzuna_app_key,
            "what": query,
            "results_per_page": per_page,
            "content-type": "application/json",
        }
        if location:
            params["where"] = location

        url = f"{BASE_URL}/{country}/search/1"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        return [self._normalize(item) for item in data.get("results", [])]

    def _normalize(self, item: dict) -> NormalizedJob:
        posted_at = None
        if raw_date := item.get("created"):
            try:
                posted_at = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            except ValueError:
                posted_at = None

        company = (item.get("company") or {}).get("display_name")
        location = (item.get("location") or {}).get("display_name")
        category = (item.get("category") or {}).get("label")

        return NormalizedJob(
            source=self.name,
            external_id=str(item.get("id")),
            url=item.get("redirect_url", ""),
            title=item.get("title", ""),
            company=company,
            location=location,
            description=item.get("description"),
            salary_min=item.get("salary_min"),
            salary_max=item.get("salary_max"),
            currency="USD" if settings.adzuna_country == "us" else None,
            employment_type=item.get("contract_time"),
            category=category,
            posted_at=posted_at,
            raw=item,
        )
