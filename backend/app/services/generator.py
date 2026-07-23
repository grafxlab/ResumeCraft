from __future__ import annotations

import json

from app.models import JobPosting, Profile
from app.services import llm

RESUME_SYSTEM = (
    "You are an expert resume writer. Tailor a resume to a specific job using "
    "ONLY the facts provided in the candidate profile. Never invent employers, "
    "titles, dates, skills, or achievements. Reorder and rephrase existing "
    "content to emphasize relevance to the job. Output clean Markdown."
)

COVER_LETTER_SYSTEM = (
    "You are an expert cover letter writer. Write a concise, specific, and "
    "professional cover letter (3-4 short paragraphs) using ONLY facts from the "
    "candidate profile. Never fabricate experience. Output plain text."
)


def _profile_payload(profile: Profile) -> str:
    return json.dumps(
        {
            "full_name": profile.full_name,
            "email": profile.email,
            "phone": profile.phone,
            "location": profile.location,
            "summary": profile.summary,
            "master_resume_text": profile.master_resume_text,
            "skills": profile.skills,
            "experience": profile.experience,
            "education": profile.education,
            "links": profile.links,
        },
        indent=2,
        default=str,
    )


def _job_payload(job: JobPosting) -> str:
    return json.dumps(
        {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "description": job.description,
        },
        indent=2,
        default=str,
    )


def _with_instructions(prompt: str, instructions: str | None = None) -> str:
    """Append optional user refinement instructions to a base prompt."""
    if instructions and instructions.strip():
        return (
            f"{prompt}\n\nADDITIONAL INSTRUCTIONS FROM THE CANDIDATE "
            f"(follow these, but still never fabricate facts):\n{instructions.strip()}"
        )
    return prompt


async def generate_resume(
    job: JobPosting,
    profile: Profile,
    instructions: str | None = None,
    template_content: str | None = None,
    user_id: int | None = None,
) -> str:
    prompt = (
        "CANDIDATE PROFILE (source of truth — do not add anything not here):\n"
        f"{_profile_payload(profile)}\n\n"
        "The master_resume_text contains the complete imported resume and may "
        "include valuable facts omitted from the structured fields. Use those "
        "facts when relevant, but do not copy irrelevant content.\n\n"
        "TARGET JOB:\n"
        f"{_job_payload(job)}\n\n"
        "Produce a tailored, ATS-friendly resume in Markdown. Include: header "
        "with contact info, a tailored summary, no more than 10 skills ordered by "
        "relevance to this job, and "
        "experience with achievement-focused bullets reordered for relevance."
    )
    if template_content:
        prompt += (
            "\n\nSELECTED RESUME TEMPLATE:\n"
            f"{template_content}\n\n"
            "Use this template's section ordering, headings, and visual intent as "
            "the formatting guide. The template supplies the candidate header and "
            "contact details, so do not repeat them in the Markdown. Return Markdown "
            "only, not HTML or placeholder tokens, so the result remains editable and "
            "exportable."
        )
    return await llm.complete(
        RESUME_SYSTEM,
        _with_instructions(prompt, instructions),
        max_tokens=2000,
        operation="resume_generation",
        user_id=user_id,
    )


async def generate_cover_letter(
    job: JobPosting,
    profile: Profile,
    instructions: str | None = None,
    template_content: str | None = None,
    user_id: int | None = None,
) -> str:
    prompt = (
        "CANDIDATE PROFILE (source of truth — do not add anything not here):\n"
        f"{_profile_payload(profile)}\n\n"
        "The master_resume_text contains the complete imported resume and may "
        "include valuable facts omitted from the structured fields. Use those "
        "facts when relevant, but do not copy irrelevant content.\n\n"
        "TARGET JOB:\n"
        f"{_job_payload(job)}\n\n"
        "Write a tailored cover letter addressed to the hiring team at the "
        "company. Reference specific requirements from the job and connect them "
        "to real experience from the profile."
    )
    if template_content:
        prompt += (
            "\n\nCOVER LETTER TEMPLATE:\n"
            f"{template_content}\n\n"
            "Use this template's sections, tone, and visual intent as the formatting "
            "guide. The template supplies the candidate header and contact details, "
            "so do not repeat them in the Markdown. Return Markdown only, not HTML or "
            "placeholder tokens, so the result remains editable and exportable."
        )
    return await llm.complete(
        COVER_LETTER_SYSTEM,
        _with_instructions(prompt, instructions),
        max_tokens=1200,
        operation="cover_letter_generation",
        user_id=user_id,
    )
