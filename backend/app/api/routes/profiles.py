from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Profile
from app.schemas import ProfileCreate, ProfileOut
from app.services import resume_parser
from app.services.llm import LLMError

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.post("/parse-resume", response_model=ProfileCreate)
async def parse_resume(file: UploadFile) -> ProfileCreate:
    """Extract structured profile data from an uploaded resume (PDF/DOCX/TXT).

    Returns the parsed fields for review; it does not persist a profile.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        text = resume_parser.extract_text(file.filename or "", data)
        parsed = await resume_parser.parse_resume(text)
    except resume_parser.ResumeParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Coerce into the profile schema, ignoring unexpected keys.
    try:
        return ProfileCreate(**{k: parsed.get(k) for k in ProfileCreate.model_fields if parsed.get(k) is not None})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=422, detail=f"Parsed data was invalid: {exc}"
        ) from exc


@router.post("", response_model=ProfileOut, status_code=201)
async def create_profile(
    payload: ProfileCreate, session: AsyncSession = Depends(get_session)
) -> Profile:
    profile = Profile(**payload.model_dump())
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.get("", response_model=list[ProfileOut])
async def list_profiles(session: AsyncSession = Depends(get_session)) -> list[Profile]:
    result = await session.execute(select(Profile).order_by(Profile.id))
    return list(result.scalars().all())


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(
    profile_id: int, session: AsyncSession = Depends(get_session)
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: int,
    payload: ProfileCreate,
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    for key, value in payload.model_dump().items():
        setattr(profile, key, value)
    await session.commit()
    await session.refresh(profile)
    return profile
