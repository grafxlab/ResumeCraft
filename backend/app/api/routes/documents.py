from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import current_user
from app.database import get_session
from app.models import Document, DocumentType, JobPosting, JobStatus, Profile, ResumeTemplate, User
from app.schemas import (
    DocumentOut,
    DocumentPreviewOut,
    DocumentPreviewRequest,
    DocumentUpdate,
    GenerateRequest,
    RegenerateRequest,
)
from app.services import generator
from app.services.llm import LLMError
from app.services.pdf import markdown_to_pdf
from app.services.template_renderer import render_document_template

router = APIRouter(prefix="/documents", tags=["documents"])
DEFAULT_TEMPLATE_DIRECTORY = Path(__file__).resolve().parents[4] / "frontend/public/templates"
DEFAULT_TEMPLATE_PATHS = {
    DocumentType.RESUME: DEFAULT_TEMPLATE_DIRECTORY / "default-resume-template.html",
    DocumentType.COVER_LETTER: DEFAULT_TEMPLATE_DIRECTORY / "default-letter-template.html",
}


def _default_template_content(doc_type: DocumentType) -> str:
    try:
        return DEFAULT_TEMPLATE_PATHS[doc_type].read_text(encoding="utf-8")
    except OSError as exc:
        label = "resume" if doc_type == DocumentType.RESUME else "cover letter"
        raise HTTPException(status_code=500, detail=f"Default {label} template is unavailable") from exc


async def _generate_content(
    job: JobPosting,
    profile: Profile,
    doc_type: DocumentType,
    instructions: str | None,
    template_content: str | None = None,
) -> str:
    if doc_type == DocumentType.RESUME:
        return await generator.generate_resume(
            job, profile, instructions, template_content
        )
    return await generator.generate_cover_letter(
        job, profile, instructions, template_content
    )


async def _generate(
    req: GenerateRequest,
    doc_type: DocumentType,
    session: AsyncSession,
    user: User,
) -> Document:
    job = await session.get(JobPosting, req.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = await session.get(Profile, req.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    template_content = None
    template_id = (
        req.resume_template_id or profile.resume_template_id
        if doc_type == DocumentType.RESUME
        else profile.cover_letter_template_id
    )
    if template_id is not None:
        template = await session.scalar(
            select(ResumeTemplate).where(
                ResumeTemplate.id == template_id,
                ResumeTemplate.user_id == user.id,
                ResumeTemplate.document_type == doc_type.value,
            )
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Resume template not found")
        template_content = template.content
    else:
        template_content = _default_template_content(doc_type)

    try:
        content = await _generate_content(
            job, profile, doc_type, req.instructions, template_content
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc = Document(
        job_id=job.id,
        type=doc_type,
        content=content,
        template_content=template_content,
        rendered_html=render_document_template(template_content, content, profile, job),
    )
    session.add(doc)
    job.status = JobStatus.GENERATED
    await session.commit()
    await session.refresh(doc)
    return doc


@router.post("/resume", response_model=DocumentOut, status_code=201)
async def generate_resume(
    req: GenerateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Document:
    return await _generate(req, DocumentType.RESUME, session, user)


@router.post("/cover-letter", response_model=DocumentOut, status_code=201)
async def generate_cover_letter(
    req: GenerateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Document:
    return await _generate(req, DocumentType.COVER_LETTER, session, user)


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    job_id: int | None = None, session: AsyncSession = Depends(get_session)
) -> list[Document]:
    stmt = select(Document)
    if job_id is not None:
        stmt = stmt.where(Document.job_id == job_id)
    stmt = stmt.order_by(Document.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: int, session: AsyncSession = Depends(get_session)
) -> Document:
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{document_id}/preview", response_model=DocumentPreviewOut)
async def preview_document(
    document_id: int,
    payload: DocumentPreviewRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> DocumentPreviewOut:
    """Render a document against the profile's current selected template."""
    doc = await session.get(Document, document_id)
    profile = await session.get(Profile, payload.profile_id)
    if doc is None or profile is None:
        raise HTTPException(status_code=404, detail="Document or profile not found")
    job = await session.get(JobPosting, doc.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    template_id = (
        profile.resume_template_id
        if doc.type == DocumentType.RESUME
        else profile.cover_letter_template_id
    )
    if template_id is not None:
        template = await session.scalar(
            select(ResumeTemplate).where(
                ResumeTemplate.id == template_id,
                ResumeTemplate.user_id == user.id,
                ResumeTemplate.document_type == doc.type.value,
            )
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Resume template not found")
        template_content = template.content
    else:
        template_content = _default_template_content(doc.type)

    return DocumentPreviewOut(
        rendered_html=render_document_template(
            template_content, payload.content if payload.content is not None else doc.content,
            profile, job,
        )
    )


@router.get("/{document_id}/pdf")
async def download_pdf(
    document_id: int, session: AsyncSession = Depends(get_session)
) -> Response:
    """Render the document's Markdown to a PDF and return it as a download."""
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        pdf_bytes = markdown_to_pdf(doc.content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    kind = "resume" if doc.type == DocumentType.RESUME else "cover_letter"
    filename = f"{kind}_{doc.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: int,
    payload: DocumentUpdate,
    session: AsyncSession = Depends(get_session),
) -> Document:
    """Save manual edits and/or approve a document."""
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if payload.content is not None:
        doc.content = payload.content
        if doc.template_content is not None and payload.profile_id is not None:
            profile = await session.get(Profile, payload.profile_id)
            job = await session.get(JobPosting, doc.job_id)
            if profile is None or job is None:
                raise HTTPException(status_code=404, detail="Profile or job not found")
            doc.rendered_html = render_document_template(
                doc.template_content, doc.content, profile, job
            )
        # Manual edits invalidate a prior approval unless explicitly re-approved.
        if payload.approved is None:
            doc.approved = False
    if payload.approved is not None:
        doc.approved = payload.approved
    await session.commit()
    await session.refresh(doc)
    return doc


@router.post("/{document_id}/regenerate", response_model=DocumentOut)
async def regenerate_document(
    document_id: int,
    req: RegenerateRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Document:
    """Regenerate a document in place using an optional refinement prompt."""
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    job = await session.get(JobPosting, doc.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = await session.get(Profile, req.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    template_content = None
    template_id = (
        req.resume_template_id or profile.resume_template_id
        if doc.type == DocumentType.RESUME
        else profile.cover_letter_template_id
    )
    if template_id is not None:
        template = await session.scalar(
            select(ResumeTemplate).where(
                ResumeTemplate.id == template_id,
                ResumeTemplate.user_id == user.id,
                ResumeTemplate.document_type == doc.type.value,
            )
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Resume template not found")
        template_content = template.content
    else:
        template_content = _default_template_content(doc.type)

    try:
        doc.content = await _generate_content(
            job, profile, doc.type, req.instructions, template_content
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc.template_content = template_content
    doc.rendered_html = render_document_template(
        template_content, doc.content, profile, job
    )
    doc.approved = False
    await session.commit()
    await session.refresh(doc)
    return doc
