import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import current_user
from app.database import get_session
from app.models import ResumeTemplate, User
from app.schemas import ResumeTemplateCreate, ResumeTemplateOut

router = APIRouter(prefix="/resume-templates", tags=["resume templates"])
MAX_TEMPLATE_LENGTH = 250_000
SUPPORTED_PLACEHOLDERS = {
    "FULL_NAME", "PROFESSIONAL_HEADLINE", "EMAIL", "PHONE", "LOCATION",
    "LINKEDIN_URL", "PORTFOLIO_URL", "OVERVIEW", "SKILL", "JOB_TITLE",
    "EMPLOYMENT_DATES", "COMPANY", "JOB_LOCATION", "EMPLOYMENT_ACHIEVEMENT",
    "DEGREE_OR_CREDENTIAL", "EDUCATION_DATES", "INSTITUTION",
    "EDUCATION_LOCATION", "EDUCATION_DETAILS", "ADDITIONAL_LABEL",
    "ADDITIONAL_INFORMATION",
}
SUPPORTED_COVER_LETTER_PLACEHOLDERS = {
    "FULL_NAME", "EMAIL", "PHONE", "LOCATION", "LINKEDIN_URL", "DATE",
    "RECIPIENT_NAME", "COMPANY", "COMPANY_LOCATION", "SALUTATION", "CLOSING",
    "LETTER_BODY", "DOCUMENT_CONTENT",
}
MIN_PLACEHOLDER_COUNT = 3


def _validate_template(payload: ResumeTemplateCreate) -> tuple[str, str]:
    name = payload.name.strip()
    content = payload.content.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Template name is required")
    if len(name) > 120:
        raise HTTPException(status_code=422, detail="Template name is too long")
    if not content:
        raise HTTPException(status_code=422, detail="Template content is required")
    if len(content) > MAX_TEMPLATE_LENGTH:
        raise HTTPException(status_code=422, detail="Template is larger than 250 KB")
    if payload.document_type not in {"resume", "cover_letter"}:
        raise HTTPException(status_code=422, detail="Template type must be resume or cover_letter")
    placeholders = set(re.findall(r"{{\s*([A-Z][A-Z0-9_]*)\s*}}", content))
    supported = placeholders & (
        SUPPORTED_PLACEHOLDERS
        if payload.document_type == "resume"
        else SUPPORTED_COVER_LETTER_PLACEHOLDERS
    )
    if len(supported) < MIN_PLACEHOLDER_COUNT:
        raise HTTPException(
            status_code=422,
            detail=(
                "Templates must include at least three supported placeholders, "
                "for the selected document type."
            ),
        )
    return name, content


@router.get("", response_model=list[ResumeTemplateOut])
async def list_resume_templates(
    document_type: str | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ResumeTemplate]:
    stmt = select(ResumeTemplate).where(ResumeTemplate.user_id == user.id)
    if document_type is not None:
        if document_type not in {"resume", "cover_letter"}:
            raise HTTPException(status_code=422, detail="Invalid template type")
        stmt = stmt.where(ResumeTemplate.document_type == document_type)
    result = await session.execute(stmt.order_by(ResumeTemplate.updated_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ResumeTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_resume_template(
    payload: ResumeTemplateCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ResumeTemplate:
    name, content = _validate_template(payload)
    template = ResumeTemplate(
        user_id=user.id,
        name=name,
        document_type=payload.document_type,
        content=content,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume_template(
    template_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    template = await session.scalar(
        select(ResumeTemplate).where(
            ResumeTemplate.id == template_id,
            ResumeTemplate.user_id == user.id,
        )
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Resume template not found")
    await session.delete(template)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)