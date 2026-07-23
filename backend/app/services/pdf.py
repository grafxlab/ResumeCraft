from __future__ import annotations

import io

import markdown as md
from xhtml2pdf import pisa

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


def html_to_pdf(html: str) -> bytes:
    """Render a full HTML document (e.g. a rendered template) into PDF bytes."""
    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, encoding="utf-8")
    if result.err:
        raise RuntimeError("Failed to render PDF from document template.")
    return buffer.getvalue()
