from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import IgnoredWord, JobPosting, JobStatus, Profile
from app.schemas import JobPostingOut, JobSearchRequest, JobStatusUpdate
from app.services import matcher
from app.services.sources import available_sources, search_all

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/sources")
async def list_sources() -> dict:
    return {"available": available_sources()}


@router.post("/search", response_model=list[JobPostingOut])
async def search_jobs(
    req: JobSearchRequest,
    profile_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[JobPosting]:
    """Search the selected boards, upsert results, and (optionally) score them."""
    found = await search_all(
        req.query, req.location, req.results_per_source, req.sources
    )
    if not found:
        return []

    profile: Profile | None = None
    ignored_words: set[str] = set()
    if profile_id is not None:
        profile = await session.get(Profile, profile_id)
        if profile is not None:
            ignored_words = set(
                (
                    await session.scalars(
                        select(IgnoredWord.word).where(
                            IgnoredWord.profile_id == profile_id
                        )
                    )
                ).all()
            )

    stored: list[JobPosting] = []
    for job in found:
        if not job.external_id or job.external_id == "None":
            continue
        values = {
            "source": job.source,
            "external_id": job.external_id,
            "url": job.url,
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "description": job.description,
            "salary_min": job.salary_min,
            "salary_max": job.salary_max,
            "currency": job.currency,
            "employment_type": job.employment_type,
            "category": job.category,
            "posted_at": job.posted_at,
        }
        stmt = (
            pg_insert(JobPosting)
            .values(**values)
            .on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_={"url": job.url, "description": job.description},
            )
            .returning(JobPosting.id)
        )
        result = await session.execute(stmt)
        job_id = result.scalar_one()
        row = await session.get(JobPosting, job_id)
        if row is not None:
            if profile is not None:
                row.match_score, row.match_notes = matcher.score_job(
                    row, profile, ignored_words
                )
                row.status = JobStatus.MATCHED
            stored.append(row)

    await session.commit()
    stored.sort(key=lambda j: j.match_score or 0, reverse=True)
    return stored


@router.get("", response_model=list[JobPostingOut])
async def list_jobs(
    status: JobStatus | None = None,
    min_score: float | None = None,
    limit: int = 100,
    session: AsyncSession = Depends(get_session),
) -> list[JobPosting]:
    stmt = select(JobPosting)
    if status is not None:
        stmt = stmt.where(JobPosting.status == status)
    if min_score is not None:
        stmt = stmt.where(JobPosting.match_score >= min_score)
    stmt = stmt.order_by(JobPosting.match_score.desc().nullslast()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("/{job_id}/rescore", response_model=JobPostingOut)
async def rescore_job(
    job_id: int,
    profile_id: int = Query(),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    ignored_words = set(
        (
            await session.scalars(
                select(IgnoredWord.word).where(IgnoredWord.profile_id == profile_id)
            )
        ).all()
    )
    job.match_score, job.match_notes = matcher.score_job(
        job, profile, ignored_words
    )
    await session.commit()
    await session.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobPostingOut)
async def get_job(
    job_id: int, session: AsyncSession = Depends(get_session)
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}/status", response_model=JobPostingOut)
async def update_status(
    job_id: int,
    payload: JobStatusUpdate,
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = payload.status
    await session.commit()
    await session.refresh(job)
    return job
