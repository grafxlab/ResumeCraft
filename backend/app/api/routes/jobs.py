from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import current_user
from app.database import get_session
from app.models import IgnoredWord, JobPosting, JobStatus, Profile, User
from app.schemas import (
    JobPostingOut,
    JobSearchRequest,
    JobStatusUpdate,
    ManualJobImportOut,
    ManualJobImportRequest,
    ManualJobUpsert,
)
from app.services import job_importer, matcher
from app.services.llm import LLMError
from app.services.sources import available_sources, search_all

router = APIRouter(prefix="/jobs", tags=["jobs"])


async def _find_duplicate_manual_job(
    session: AsyncSession,
    user_id: int,
    url: str | None,
    exclude_id: int | None = None,
) -> JobPosting | None:
    normalized_url = job_importer.normalize_job_url(url or "")
    if not normalized_url:
        return None
    stmt = select(JobPosting).where(
        JobPosting.source == "manual",
        JobPosting.user_id == user_id,
        JobPosting.url != "",
    )
    if exclude_id is not None:
        stmt = stmt.where(JobPosting.id != exclude_id)
    jobs = (await session.scalars(stmt)).all()
    return next(
        (
            job
            for job in jobs
            if job_importer.normalize_job_url(job.url) == normalized_url
        ),
        None,
    )


async def _profile_match_context(
    profile_id: int | None, session: AsyncSession
) -> tuple[Profile | None, set[str]]:
    if profile_id is None:
        return None, set()
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
    return profile, ignored_words


def _score_job(
    job: JobPosting, profile: Profile | None, ignored_words: set[str]
) -> None:
    if profile is None:
        return
    job.match_score, job.match_notes = matcher.score_job(job, profile, ignored_words)
    job.status = JobStatus.MATCHED


def _apply_manual_job(job: JobPosting, payload: ManualJobUpsert) -> None:
    title = payload.title.strip()
    description = payload.description.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Job title is required")
    if not description:
        raise HTTPException(status_code=422, detail="Job description is required")
    job.title = title
    job.manual_source = payload.source.strip() if payload.source else None
    job.company = payload.company.strip() if payload.company else None
    job.location = payload.location.strip() if payload.location else None
    job.url = payload.url.strip() if payload.url else ""
    job.description = description
    job.employment_type = (
        payload.employment_type.strip() if payload.employment_type else None
    )


@router.get("/sources")
async def list_sources() -> dict:
    return {"available": available_sources()}


@router.post("/search", response_model=list[JobPostingOut])
async def search_jobs(
    req: JobSearchRequest,
    profile_id: int | None = Query(default=None),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[JobPosting]:
    """Search the selected boards, upsert results, and (optionally) score them."""
    found = await search_all(
        req.query, req.location, req.results_per_source, req.sources
    )
    profile, ignored_words = await _profile_match_context(profile_id, session)

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
            _score_job(row, profile, ignored_words)
            stored.append(row)

    manual_jobs = list(
        (
            await session.scalars(
                select(JobPosting).where(
                    JobPosting.source == "manual",
                    JobPosting.user_id == user.id,
                    JobPosting.status != JobStatus.ARCHIVED,
                )
            )
        ).all()
    )
    for job in manual_jobs:
        _score_job(job, profile, ignored_words)
    stored.extend(manual_jobs)

    await session.commit()
    stored.sort(key=lambda j: j.match_score or 0, reverse=True)
    return stored


@router.get("", response_model=list[JobPostingOut])
async def list_jobs(
    status: JobStatus | None = None,
    min_score: float | None = None,
    limit: int = 100,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[JobPosting]:
    stmt = select(JobPosting).where(
        or_(JobPosting.source != "manual", JobPosting.user_id == user.id)
    )
    if status is not None:
        stmt = stmt.where(JobPosting.status == status)
    if min_score is not None:
        stmt = stmt.where(JobPosting.match_score >= min_score)
    stmt = stmt.order_by(JobPosting.match_score.desc().nullslast()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/manual", response_model=list[JobPostingOut])
async def list_manual_jobs(
    profile_id: int | None = Query(default=None),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[JobPosting]:
    profile, ignored_words = await _profile_match_context(profile_id, session)
    jobs = list(
        (
            await session.scalars(
                select(JobPosting).where(
                    JobPosting.source == "manual",
                    JobPosting.user_id == user.id,
                    JobPosting.status != JobStatus.ARCHIVED,
                )
            )
        ).all()
    )
    for job in jobs:
        _score_job(job, profile, ignored_words)
    await session.commit()
    jobs.sort(key=lambda job: job.match_score or 0, reverse=True)
    return jobs


@router.post("/manual", response_model=JobPostingOut, status_code=status.HTTP_201_CREATED)
async def create_manual_job(
    payload: ManualJobUpsert,
    profile_id: int = Query(),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    if await _find_duplicate_manual_job(session, user.id, payload.url):
        raise HTTPException(
            status_code=409, detail="It looks like you have already added this job."
        )
    profile, ignored_words = await _profile_match_context(profile_id, session)
    job = JobPosting(
        user_id=user.id,
        source="manual",
        external_id=f"manual-{uuid4()}",
        url="",
        title="",
        status=JobStatus.NEW,
    )
    _apply_manual_job(job, payload)
    _score_job(job, profile, ignored_words)
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


@router.post("/manual/import", response_model=ManualJobImportOut)
async def import_manual_job(
    payload: ManualJobImportRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    duplicate = await _find_duplicate_manual_job(session, user.id, payload.url)
    if duplicate is not None:
        return {"url": duplicate.url, "duplicate_job": duplicate}
    try:
        return await job_importer.import_job_from_url(payload.url, user.id)
    except job_importer.JobImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.put("/{job_id}/manual", response_model=JobPostingOut)
async def update_manual_job(
    job_id: int,
    payload: ManualJobUpsert,
    profile_id: int = Query(),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None or job.source != "manual" or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Manual job not found")
    if await _find_duplicate_manual_job(
        session, user.id, payload.url, exclude_id=job.id
    ):
        raise HTTPException(
            status_code=409, detail="It looks like you have already added this job."
        )
    profile, ignored_words = await _profile_match_context(profile_id, session)
    _apply_manual_job(job, payload)
    _score_job(job, profile, ignored_words)
    await session.commit()
    await session.refresh(job)
    return job


@router.delete("/{job_id}/manual", status_code=status.HTTP_204_NO_CONTENT)
async def delete_manual_job(
    job_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    job = await session.get(JobPosting, job_id)
    if job is None or job.source != "manual" or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Manual job not found")
    await session.delete(job)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{job_id}/rescore", response_model=JobPostingOut)
async def rescore_job(
    job_id: int,
    profile_id: int = Query(),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None or (job.source == "manual" and job.user_id != user.id):
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
    job_id: int,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None or (job.source == "manual" and job.user_id != user.id):
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}/status", response_model=JobPostingOut)
async def update_status(
    job_id: int,
    payload: JobStatusUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    job = await session.get(JobPosting, job_id)
    if job is None or (job.source == "manual" and job.user_id != user.id):
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = payload.status
    await session.commit()
    await session.refresh(job)
    return job
