from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import (
    Application,
    ApplicationStatus,
    Document,
    DocumentType,
    JobPosting,
    JobStatus,
)
from app.schemas import (
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationJobInfo,
    ApplicationUpdate,
)

router = APIRouter(prefix="/applications", tags=["applications"])


async def _latest_document_id(
    session: AsyncSession, job_id: int, doc_type: DocumentType
) -> int | None:
    """Return the most recent document of a type for a job, if any."""
    stmt = (
        select(Document.id)
        .where(Document.job_id == job_id, Document.type == doc_type)
        .order_by(Document.created_at.desc())
        .limit(1)
    )
    return await session.scalar(stmt)


async def _to_detail(
    session: AsyncSession, application: Application
) -> ApplicationDetailOut:
    """Build an enriched application response with job info and document refs."""
    job = await session.get(JobPosting, application.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    resume_id = application.resume_document_id or await _latest_document_id(
        session, job.id, DocumentType.RESUME
    )
    cover_id = application.cover_letter_document_id or await _latest_document_id(
        session, job.id, DocumentType.COVER_LETTER
    )

    return ApplicationDetailOut(
        id=application.id,
        job_id=application.job_id,
        status=application.status,
        date_sent=application.date_sent,
        date_response=application.date_response,
        response_type=application.response_type,
        notes=application.notes,
        created_at=application.created_at,
        updated_at=application.updated_at,
        archived=application.archived,
        resume_document_id=resume_id,
        cover_letter_document_id=cover_id,
        job=ApplicationJobInfo(
            id=job.id,
            title=job.title,
            company=job.company,
            location=job.location,
            url=job.url,
            source=job.source,
            match_score=job.match_score,
            match_notes=job.match_notes,
            salary_min=job.salary_min,
            salary_max=job.salary_max,
            currency=job.currency,
            salary_period=job.salary_period,
        ),
    )


@router.post("", response_model=ApplicationDetailOut, status_code=201)
async def create_application(
    payload: ApplicationCreate, session: AsyncSession = Depends(get_session)
) -> ApplicationDetailOut:
    job = await session.get(JobPosting, payload.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # A job can only be tracked once — make this idempotent by updating the
    # existing application instead of failing on the unique constraint.
    existing = await session.scalar(
        select(Application).where(Application.job_id == payload.job_id)
    )
    if existing is not None:
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            if value is not None:
                setattr(existing, key, value)
        if payload.status == ApplicationStatus.SENT:
            job.status = JobStatus.APPLIED
        await session.commit()
        await session.refresh(existing)
        return await _to_detail(session, existing)

    application = Application(**payload.model_dump())
    session.add(application)
    if payload.status == ApplicationStatus.SENT:
        job.status = JobStatus.APPLIED
    await session.commit()
    await session.refresh(application)
    return await _to_detail(session, application)


@router.get("", response_model=list[ApplicationDetailOut])
async def list_applications(
    status: ApplicationStatus | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[ApplicationDetailOut]:
    stmt = select(Application)
    if status is not None:
        stmt = stmt.where(Application.status == status)
    stmt = stmt.order_by(Application.created_at.desc())
    result = await session.execute(stmt)
    apps = list(result.scalars().all())
    return [await _to_detail(session, app) for app in apps]


@router.get("/{application_id}", response_model=ApplicationDetailOut)
async def get_application(
    application_id: int, session: AsyncSession = Depends(get_session)
) -> ApplicationDetailOut:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return await _to_detail(session, application)


@router.patch("/{application_id}", response_model=ApplicationDetailOut)
async def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    session: AsyncSession = Depends(get_session),
) -> ApplicationDetailOut:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(application, key, value)

    if payload.status == ApplicationStatus.SENT:
        job = await session.get(JobPosting, application.job_id)
        if job is not None:
            job.status = JobStatus.APPLIED

    await session.commit()
    await session.refresh(application)
    return await _to_detail(session, application)


@router.delete("/{application_id}", status_code=204)
async def delete_application(
    application_id: int, session: AsyncSession = Depends(get_session)
) -> None:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    await session.delete(application)
    await session.commit()
