from __future__ import annotations

import re
from collections.abc import Iterable

from app.models import JobPosting, Profile

_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")
_MATCHABLE_HEADING_RE = re.compile(
    r"(?im)^\s*(?:minimum |preferred )?(?:requirements?|qualifications?|"
    r"skills?|responsibilities|what you(?:'ll| will) (?:need|bring|do)|"
    r"what we(?:'re| are) looking for|who you are|duties)\s*:?[ \t]*$"
)
_EXCLUDED_HEADING_RE = re.compile(
    r"(?im)^\s*(?:about (?:the )?(?:company|team)|benefits?|perks?|compensation|"
    r"equal opportunity|how to apply)\s*:?[ \t]*$"
)
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


def _matchable_job_text(description: str | None) -> str:
    """Return job sections that describe work, qualifications, or required skills."""
    if not description:
        return ""

    lines: list[str] = []
    include = False
    found_heading = False
    for line in description.splitlines():
        if _MATCHABLE_HEADING_RE.match(line):
            include = True
            found_heading = True
            continue
        if _EXCLUDED_HEADING_RE.match(line):
            include = False
            continue
        if include:
            lines.append(line)

    if found_heading:
        return "\n".join(lines)

    return description


def _flatten(values: Iterable) -> list[str]:
    out: list[str] = []
    for v in values or []:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            out.extend(str(x) for x in v.values() if isinstance(x, str))
    return out


def score_job(
    job: JobPosting, profile: Profile, ignored_words: set[str] | None = None
) -> tuple[float, str]:
    """Heuristic keyword-overlap score (0-100) plus a short explanation.

    This is intentionally dependency-free. Swap in embeddings/LLM ranking later
    by replacing this function.
    """
    profile_terms = _profile_terms(profile)
    matchable_text = _matchable_job_text(job.description)
    job_terms = _tokenize(matchable_text)
    job_terms -= {word.lower() for word in ignored_words or set()}

    if not profile_terms or not job_terms:
        return 0.0, "No matchable job requirements found to score."

    overlap = profile_terms & job_terms
    # Coverage of the job's terms that the profile satisfies.
    coverage = len(overlap) / len(job_terms)
    score = round(min(coverage * 100 * 2.5, 100), 1)

    matched = sorted(overlap)[:15]
    missing = sorted(job_terms - profile_terms)[:15]
    notes = (
        f"Matched: {', '.join(matched) or 'none'}. "
        f"Missing: {', '.join(missing) or 'none'}."
    )
    return score, notes
