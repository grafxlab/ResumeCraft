from __future__ import annotations

import asyncio
import ipaddress
import json
import socket
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx

from app.services import llm

MAX_PAGE_BYTES = 2_000_000
MAX_PAGE_TEXT_CHARS = 80_000
MAX_REDIRECTS = 5
JOB_SOURCE_HOSTS = {
    "linkedin.com": "LinkedIn",
    "indeed.com": "Indeed",
    "glassdoor.com": "Glassdoor",
    "ziprecruiter.com": "ZipRecruiter",
    "monster.com": "Monster",
    "dice.com": "Dice",
    "wellfound.com": "Wellfound",
    "usajobs.gov": "USAJobs",
    "simplyhired.com": "SimplyHired",
}
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "ref", "refid", "source", "trk"}


class JobImportError(RuntimeError):
    pass


def _source_from_url(url: str) -> str | None:
    hostname = (urlparse(url).hostname or "").lower().removeprefix("www.")
    return next(
        (
            source
            for domain, source in JOB_SOURCE_HOSTS.items()
            if hostname == domain or hostname.endswith(f".{domain}")
        ),
        None,
    )


def _valid_source(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    source = value.strip()
    if "://" in source or "/" in source or ".com" in source.lower():
        return None
    return source


def normalize_job_url(url: str) -> str:
    value = url.strip()
    if not value:
        return ""
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower().removeprefix("www.")
    if not hostname:
        return value
    port = parsed.port
    netloc = hostname if port in {None, 80, 443} else f"{hostname}:{port}"
    query = urlencode(
        sorted(
            (key, item)
            for key, item in parse_qsl(parsed.query, keep_blank_values=True)
            if not key.lower().startswith("utm_")
            and key.lower() not in TRACKING_QUERY_KEYS
        )
    )
    return urlunparse(
        (parsed.scheme.lower(), netloc, parsed.path.rstrip("/") or "/", "", query, "")
    )


class _JobPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text: list[str] = []
        self.structured_data: list[str] = []
        self.metadata: dict[str, str] = {}
        self._ignored_depth = 0
        self._json_ld_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value or "" for key, value in attrs}
        if tag in {"style", "noscript", "svg"}:
            self._ignored_depth += 1
        elif tag == "script":
            if attributes.get("type", "").lower() == "application/ld+json":
                self._json_ld_depth += 1
            else:
                self._ignored_depth += 1
        elif tag == "meta":
            key = attributes.get("property") or attributes.get("name")
            content = attributes.get("content")
            if key and content:
                self.metadata[key.lower()] = content.strip()

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._json_ld_depth:
            self._json_ld_depth -= 1
        elif tag in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        value = " ".join(data.split())
        if not value:
            return
        if self._json_ld_depth:
            self.structured_data.append(value)
        elif not self._ignored_depth:
            self.text.append(value)


async def _validate_public_url(url: str) -> str:
    value = url.strip()
    if not value:
        raise JobImportError("Paste a job posting URL first.")
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise JobImportError("Enter a valid HTTP or HTTPS job posting URL.")
    if parsed.username or parsed.password:
        raise JobImportError("URLs containing credentials are not supported.")

    try:
        addresses = await asyncio.to_thread(
            socket.getaddrinfo, parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise JobImportError("The job posting host could not be found.") from exc
    for address in {item[4][0] for item in addresses}:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise JobImportError("Private or local network URLs are not supported.")
    return value


async def _fetch_page(url: str) -> tuple[str, str]:
    current_url = await _validate_public_url(url)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        for _ in range(MAX_REDIRECTS + 1):
            async with client.stream("GET", current_url, follow_redirects=False) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise JobImportError("The job posting redirected without a destination.")
                    current_url = await _validate_public_url(urljoin(current_url, location))
                    continue
                if response.status_code in {401, 403, 429}:
                    raise JobImportError(
                        "The job site blocked automatic access. Paste the job details manually."
                    )
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise JobImportError(
                        f"The job posting could not be loaded ({response.status_code})."
                    ) from exc
                content_type = response.headers.get("content-type", "").lower()
                if "html" not in content_type and "text" not in content_type:
                    raise JobImportError("The URL did not return a readable web page.")
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_PAGE_BYTES:
                        raise JobImportError("The job posting page is too large to import.")
                return current_url, content.decode(response.encoding or "utf-8", errors="replace")
    raise JobImportError("The job posting redirected too many times.")


def _extract_json(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        raise JobImportError("The AI response could not be parsed. Try again.")
    try:
        value = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise JobImportError("The AI response could not be parsed. Try again.") from exc
    if not isinstance(value, dict):
        raise JobImportError("The AI response was not a job posting object.")
    return value


async def import_job_from_url(url: str, user_id: int | None = None) -> dict:
    final_url, page = await _fetch_page(url)
    parser = _JobPageParser()
    parser.feed(page)
    page_text = "\n".join(parser.text)[:MAX_PAGE_TEXT_CHARS]
    if len(page_text) < 80 and not parser.structured_data:
        raise JobImportError(
            "No readable job details were found. Paste the job details manually."
        )
    prompt = (
        "Extract this job posting into JSON matching exactly this schema:\n"
        '{"title": string|null, "source": string|null, "company": string|null, '
        '"location": string|null, "description": string|null, '
        '"employment_type": string|null}\n'
        "Use only facts present in the supplied page. Preserve the complete useful job "
        "description, including responsibilities and qualifications. Respond with JSON only.\n\n"
        f"FINAL URL:\n{final_url}\n\n"
        f"PAGE METADATA:\n{json.dumps(parser.metadata)}\n\n"
        f"STRUCTURED DATA:\n{' '.join(parser.structured_data)}\n\n"
        f"READABLE PAGE TEXT:\n{page_text}"
    )
    raw = await llm.complete(
        "You extract structured job posting data accurately and never invent missing facts.",
        prompt,
        max_tokens=4096,
        operation="job_url_import",
        user_id=user_id,
    )
    extracted = _extract_json(raw)
    result = {
        key: value.strip() if isinstance(value, str) and value.strip() else None
        for key, value in extracted.items()
        if key
        in {"title", "source", "company", "location", "description", "employment_type"}
    }
    result["source"] = _source_from_url(final_url) or _valid_source(
        result.get("source")
    )
    if not result.get("title") and not result.get("description"):
        raise JobImportError(
            "AI could not find job details on this page. Paste the details manually."
        )
    result["url"] = final_url
    return result