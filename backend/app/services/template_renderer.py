from __future__ import annotations

import html
import re
from datetime import date

import markdown

from app.models import JobPosting, Profile

_PLACEHOLDER_RE = re.compile(r"{{\s*([A-Z][A-Z0-9_]*)\s*}}")
_SKILL_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")
_FONT_AWESOME_KIT_RE = re.compile(
    r"<script\b(?=[^>]*\bsrc=[\"']https://kit\.fontawesome\.com/"
    r"([a-zA-Z0-9]+)\.js(?:\?[^\"']*)?[\"'])[^>]*>\s*</script>",
    flags=re.IGNORECASE,
)
_FONT_AWESOME_CDN_STYLESHEET = (
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
)
_MAX_TEMPLATE_SKILLS = 10


def _value(item: object, key: str) -> str:
    return str(item.get(key) or "") if isinstance(item, dict) else ""


def _repeat_block(template: str, pattern: str, items: list[object], render) -> str:
    match = re.search(pattern, template, flags=re.IGNORECASE | re.DOTALL)
    if match is None:
        return template
    replacement = "".join(render(match.group(0), item) for item in items)
    return template[:match.start()] + replacement + template[match.end():]


def _replace_values(template: str, values: dict[str, str]) -> str:
    return _PLACEHOLDER_RE.sub(
        lambda match: html.escape(values.get(match.group(1), "")), template
    )


def _enable_font_awesome_icons(template: str) -> str:
    """Use static CSS because preview iframes intentionally do not run scripts."""
    return _FONT_AWESOME_KIT_RE.sub(
        f'<link rel="stylesheet" href="{_FONT_AWESOME_CDN_STYLESHEET}">',
        template,
    )


def _professional_headline(profile: Profile) -> str:
    for experience in profile.experience or []:
        title = _value(experience, "title")
        if title:
            return title
    return profile.skills[0] if profile.skills else ""


def select_relevant_skills(profile: Profile, job: JobPosting) -> list[object]:
    """Keep the template skills section concise and ordered by job relevance."""
    job_terms = {
        token.rstrip(".").lower()
        for token in _SKILL_TOKEN_RE.findall(job.description or "")
    }
    ranked: list[tuple[int, int, object]] = []
    for index, skill in enumerate(profile.skills or []):
        skill_terms = {
            token.rstrip(".").lower()
            for token in _SKILL_TOKEN_RE.findall(str(skill))
        }
        overlap = len(skill_terms & job_terms)
        # Prefer a skill whose complete phrase appears in the job description.
        exact_match = bool(skill_terms) and skill_terms <= job_terms
        ranked.append(((100 if exact_match else 0) + overlap, -index, skill))

    ranked.sort(reverse=True, key=lambda item: (item[0], item[1]))
    return [skill for _, _, skill in ranked[:_MAX_TEMPLATE_SKILLS]]


def render_document_template(
    template: str, content: str, profile: Profile, job: JobPosting
) -> str:
    """Fill a document template using escaped profile and job values.

    DOCUMENT_CONTENT is intentionally the sole raw HTML value: it is generated
    from the document's Markdown and displayed in a sandboxed iframe by the UI.
    """
    template = _enable_font_awesome_icons(template)
    links = profile.links or {}
    additional_information = profile.additional_information or ""
    values = {
        "FULL_NAME": profile.full_name,
        "PROFESSIONAL_HEADLINE": _professional_headline(profile),
        "EMAIL": profile.email or "",
        "PHONE": profile.phone or "",
        "LOCATION": profile.location or "",
        "LINKEDIN_URL": links.get("linkedin", ""),
        "LINKEDIN_LABEL": links.get("linkedin", ""),
        "PORTFOLIO_URL": links.get("portfolio", ""),
        "PORTFOLIO_LABEL": links.get("portfolio", ""),
        "ADDITIONAL_URL": next(iter(links.values()), ""),
        "ADDITIONAL_URL_LABEL": next(iter(links.keys()), ""),
        "ADDITIONAL_LABEL": "Additional Information" if additional_information else "",
        "ADDITIONAL_INFORMATION": additional_information,
        "DATE": date.today().strftime("%B %-d, %Y"),
        "RECIPIENT_NAME": "Hiring Team",
        "COMPANY": job.company or "",
        "COMPANY_LOCATION": job.location or "",
        "SALUTATION": "Dear Hiring Team,",
        "CLOSING": "Sincerely,",
    }
    rendered_content = markdown.markdown(content, extensions=["extra", "sane_lists"])

    def render_skill(block: str, skill: object) -> str:
        return _replace_values(block, {"SKILL": str(skill)})

    def render_experience(block: str, experience: object) -> str:
        dates = " - ".join(
            part for part in (_value(experience, "start"), _value(experience, "end")) if part
        )
        highlights = experience.get("highlights", []) if isinstance(experience, dict) else []
        result = _repeat_block(
            block,
            r"<li\b[^>]*>\s*{{\s*EMPLOYMENT_ACHIEVEMENT\s*}}\s*</li>",
            highlights if isinstance(highlights, list) else [],
            lambda item_block, highlight: _replace_values(
                item_block, {"EMPLOYMENT_ACHIEVEMENT": str(highlight)}
            ),
        )
        return _replace_values(
            result,
            {
                "JOB_TITLE": _value(experience, "title"),
                "COMPANY": _value(experience, "company"),
                "JOB_LOCATION": _value(experience, "location"),
                "EMPLOYMENT_DATES": dates,
            },
        )

    def render_education(block: str, education: object) -> str:
        return _replace_values(
            block,
            {
                "DEGREE_OR_CREDENTIAL": _value(education, "degree"),
                "INSTITUTION": _value(education, "institution"),
                "EDUCATION_DATES": _value(education, "year"),
                "EDUCATION_LOCATION": _value(education, "location"),
                "EDUCATION_DETAILS": _value(education, "details"),
            },
        )

    rendered = _repeat_block(
        template,
        r"<li\b[^>]*>\s*{{\s*SKILL\s*}}\s*</li>",
        select_relevant_skills(profile, job),
        render_skill,
    )
    rendered = _repeat_block(
        rendered,
        r"<article\b[^>]*\bclass=[\"'][^\"']*employment-item[^\"']*[\"'][^>]*>.*?</article>",
        profile.experience or [],
        render_experience,
    )
    rendered = _repeat_block(
        rendered,
        r"<article\b[^>]*\bclass=[\"'][^\"']*education-item[^\"']*[\"'][^>]*>.*?</article>",
        profile.education or [],
        render_education,
    )
    values["OVERVIEW"] = profile.summary or ""

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name == "DOCUMENT_CONTENT":
            return rendered_content
        return html.escape(str(values.get(name, "")))

    rendered = _PLACEHOLDER_RE.sub(replace, rendered)
    if "DOCUMENT_CONTENT" not in template:
        return rendered
    return rendered