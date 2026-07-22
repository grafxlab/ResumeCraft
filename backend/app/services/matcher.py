from __future__ import annotations

import re
from collections.abc import Iterable

from app.models import JobPosting, Profile

_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")

# Common words to ignore when comparing job text to a profile.
_STOPWORDS = {
    "the", "and", "for", "with", "you", "our", "will", "are", "have", "this",
    "that", "job", "role", "work", "team", "years", "experience", "ability",
    "including", "must", "should", "from", "your", "who", "all", "not", "can",
    "was", "has", "but", "they", "their", "would", "which", "into", "more",
    "other", "about", "some", "any", "over", "per", "day", "new", "using",
}


def _tokenize(text: str | None) -> set[str]:
    if not text:
        return set()
    tokens = {t.lower() for t in _TOKEN_RE.findall(text)}
    return {t for t in tokens if t not in _STOPWORDS and len(t) > 2}


def _profile_terms(profile: Profile) -> set[str]:
    terms: set[str] = set()
    terms |= _tokenize(profile.summary)
    for skill in _flatten(profile.skills):
        terms |= _tokenize(skill)
    for exp in profile.experience or []:
        if isinstance(exp, dict):
            terms |= _tokenize(exp.get("title"))
            terms |= _tokenize(exp.get("description"))
            for bullet in exp.get("highlights", []) or []:
                terms |= _tokenize(bullet)
    return terms


def _flatten(values: Iterable) -> list[str]:
    out: list[str] = []
    for v in values or []:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            out.extend(str(x) for x in v.values() if isinstance(x, str))
    return out


def score_job(job: JobPosting, profile: Profile) -> tuple[float, str]:
    """Heuristic keyword-overlap score (0-100) plus a short explanation.

    This is intentionally dependency-free. Swap in embeddings/LLM ranking later
    by replacing this function.
    """
    profile_terms = _profile_terms(profile)
    job_terms = _tokenize(job.description) | _tokenize(job.title)

    if not profile_terms or not job_terms:
        return 0.0, "Insufficient data to score."

    overlap = profile_terms & job_terms
    # Coverage of the job's terms that the profile satisfies.
    coverage = len(overlap) / len(job_terms)
    score = round(min(coverage * 100 * 2.5, 100), 1)

    top = sorted(overlap)[:15]
    notes = f"Matched {len(overlap)} terms. Top: {', '.join(top)}" if top else "No overlap."
    return score, notes
