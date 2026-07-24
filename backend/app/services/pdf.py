from __future__ import annotations

import base64
import io
import re

import markdown as md
from xhtml2pdf import pisa

_STYLE_BLOCK_RE = re.compile(
  r"(<style\b[^>]*>)(.*?)(</style\s*>)", flags=re.IGNORECASE | re.DOTALL
)
_CSS_RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")
_ICON_TAG_RE = re.compile(
  r"<i\b(?P<attributes>[^>]*)>\s*</i>", flags=re.IGNORECASE
)
_CLASS_ATTRIBUTE_RE = re.compile(
  r"\bclass\s*=\s*([\"'])(?P<classes>.*?)\1", flags=re.IGNORECASE | re.DOTALL
)
_FONT_AWESOME_STYLESHEET_RE = re.compile(
  r"<link\b(?=[^>]*\bhref=[\"'][^\"']*font-awesome[^\"']*\.css(?:\?[^\"']*)?[\"'])[^>]*>",
  flags=re.IGNORECASE,
)

_PDF_ICON_SVGS = {
  "fa-envelope": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="#1f2937" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="m2.2 4 5.8 4.6L13.8 4"/></g></svg>""",
  "fa-phone": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.2 1.8 5.6 4.7 4.4 6.3c1.1 2.3 2.9 4.1 5.2 5.2l1.6-1.2 2.9 2.4-.7 1.6c-.3.7-1.1 1.1-1.9.9C6 13.9 2.1 10 0.8 4.5.6 3.7 1 2.9 1.7 2.6z" fill="#1f2937"/></svg>""",
  "fa-location-crosshairs": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="#1f2937" stroke-linecap="round" stroke-width="1.5"><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></g></svg>""",
  "fa-linkedin": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="1.5" fill="#1f2937"/><circle cx="4.5" cy="5" r="1" fill="white"/><path fill="white" d="M3.6 7h1.8v5H3.6zm3 0h1.7v.7c.6-.6 1.2-.9 2-.9 1.5 0 2.3 1 2.3 2.8V12h-1.8V9.8c0-.9-.3-1.4-1-1.4-.8 0-1.3.6-1.3 1.7V12H6.6z"/></svg>""",
  "fa-globe": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="#1f2937" stroke-linecap="round" stroke-width="1.25"><circle cx="8" cy="8" r="6.25"/><ellipse cx="8" cy="8" rx="2.75" ry="6.25"/><path d="M2 6h12M2 10h12"/></g></svg>""",
}

# Modern, ATS-friendly print styles applied to the rendered Markdown.
_CSS = """
@page { size: letter; margin: 1.7cm; }
body {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  color: #1f2937;
  line-height: 1.45;
}
h1 {
  font-size: 22pt;
  color: #0f172a;
  margin: 0 0 2px;
  font-weight: bold;
}
h2 {
  font-size: 12.5pt;
  color: #2563eb;
  margin: 16px 0 5px;
  padding-bottom: 3px;
  border-bottom: 1.5pt solid #93c5fd;
  font-weight: bold;
}
h3 { font-size: 11pt; color: #334155; margin: 9px 0 2px; }
p { margin: 4px 0; }
a { color: #2563eb; text-decoration: none; }
strong { color: #0f172a; }
ul { margin: 4px 0 8px; }
li { margin: 2px 0; }
hr { border: 0; border-top: 0.75pt solid #cbd5e1; margin: 8px 0; }
"""


def markdown_to_pdf(content: str) -> bytes:
    """Render Markdown text into PDF bytes (pure-Python, no system libs)."""
    body = md.markdown(content, extensions=["extra", "sane_lists"])
    html = (
        f"<html><head><style>{_CSS}</style></head>"
        f"<body>{body}</body></html>"
    )
    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, encoding="utf-8")
    if result.err:
        raise RuntimeError("Failed to render PDF from document content.")
    return buffer.getvalue()


def _sanitize_pdf_css(html: str) -> str:
    def sanitize_style(match: re.Match[str]) -> str:
        css = _CSS_RULE_RE.sub(
            lambda rule: ""
            if ":not(" in rule.group(1).lower()
            or "::before" in rule.group(1).lower()
            or "::after" in rule.group(1).lower()
            else rule.group(0),
            match.group(2),
        )
        return match.group(1) + css + match.group(3)

    return _STYLE_BLOCK_RE.sub(sanitize_style, html)


def _embed_pdf_icons(html: str) -> str:
    def replace_icon(match: re.Match[str]) -> str:
        class_match = _CLASS_ATTRIBUTE_RE.search(match.group("attributes"))
        if class_match is None:
            return match.group(0)
        classes = set(class_match.group("classes").split())
        icon_name = next((name for name in _PDF_ICON_SVGS if name in classes), None)
        if icon_name is None:
            return match.group(0)
        encoded_svg = base64.b64encode(
            _PDF_ICON_SVGS[icon_name].encode("utf-8")
        ).decode("ascii")
        return (
            f'<img src="data:image/svg+xml;base64,{encoded_svg}" '
            'width="12" height="12" alt="">'
        )

    embedded = _ICON_TAG_RE.sub(replace_icon, html)
    return _FONT_AWESOME_STYLESHEET_RE.sub("", embedded)


def html_to_pdf(html: str) -> bytes:
  """Render a full HTML document (e.g. a rendered template) into PDF bytes."""
  buffer = io.BytesIO()
  pdf_html = _sanitize_pdf_css(_embed_pdf_icons(html))
  result = pisa.CreatePDF(src=pdf_html, dest=buffer, encoding="utf-8")
  if result.err:
    raise RuntimeError("Failed to render PDF from document template.")
  return buffer.getvalue()
