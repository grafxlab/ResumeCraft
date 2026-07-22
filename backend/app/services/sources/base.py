from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class NormalizedJob:
    """A job posting normalized across every source into a common shape."""

    source: str
    external_id: str
    url: str
    title: str
    company: str | None = None
    location: str | None = None
    description: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = None
    employment_type: str | None = None
    category: str | None = None
    posted_at: datetime | None = None
    raw: dict = field(default_factory=dict)


class JobSource(abc.ABC):
    """Pluggable job board adapter. Add a new board by subclassing this."""

    name: str

    @abc.abstractmethod
    async def search(
        self, query: str, location: str | None, limit: int
    ) -> list[NormalizedJob]:
        """Return normalized postings for the given query."""

    def enabled(self) -> bool:
        """Whether the source is configured (has required credentials)."""
        return True
