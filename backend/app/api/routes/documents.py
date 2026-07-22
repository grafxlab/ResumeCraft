from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Document, DocumentType, JobPosting, JobStatus, Profile
from app.schemas import (
    DocumentOut,
    DocumentUpdate,
    GenerateRequest,
    RegenerateRequest,
)
from app.services import generator
from app.services.llm import LLMError
from app.services.pdf import markdown_to_pdf

router = APIRouter(prefix="/documents", tags=["documents"])


async def _generate_content(
    job: JobPosting,
    profile: Profile,
    doc_type: DocumentType,
    instructions: str | None,
) -> str:
    if doc_type == DocumentType.RESUME:
        return await generator.generate_resume(job, profile, instructions)
    return await generator.generate_cover_letter(job, profile, instructions)


async def _generate(
    req: GenerateRequest, doc_type: DocumentType, session: AsyncSession
) -> Document:
    job = await session.get(JobPosting, req.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = await session.get(Profile, req.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        content = await _generate_content(
            job, profile, doc_type, req.instructions
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc = Document(job_id=job.id, type=doc_type, content=content)
    session.add(doc)
    job.status = JobStatus.GENERATED
    await session.commit()
    await session.refresh(doc)
    return doc


@router.post("/resume", response_model=DocumentOut, status_code=201)
async def generate_resume(
    req: GenerateRequest, session: AsyncSession = Depends(get_session)
) -> Document:
    return await _generate(req, DocumentType.RESUME, session)


@router.post("/cover-letter", response_model=DocumentOut, status_code=201)
async def generate_cover_letter(
    req: GenerateRequest, session: AsyncSession = Depends(get_session)
) -> Document:
    return await _generate(req, DocumentType.COVER_LETTER, session)


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

    try:
        doc.content = await _generate_content(
            job, profile, doc.type, req.instructions
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc.approved = False
    await session.commit()
    await session.refresh(doc)
    return doc
