from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import current_user
from app.database import get_session
from app.models import IgnoredWord, Profile, ResumeTemplate, User
from app.schemas import (
    IgnoredWordCreate,
    IgnoredWordOut,
    ProfileAdditionalInformationUpdate,
    ProfileCreate,
    ProfileOut,
    ProfileTemplateUpdate,
)
from app.services import resume_parser
from app.services.llm import LLMError

router = APIRouter(prefix="/profiles", tags=["profiles"])
MAX_SIGNATURE_SIZE = 500_000
SIGNATURE_MIME_TYPES = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
}


async def _validate_resume_template(
    template_id: int | None,
    document_type: str,
    user: User,
    session: AsyncSession,
) -> None:
    if template_id is None:
        return
    template = await session.scalar(
        select(ResumeTemplate).where(
            ResumeTemplate.id == template_id,
            ResumeTemplate.user_id == user.id,
            ResumeTemplate.document_type == document_type,
        )
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Resume template not found")


@router.post("/parse-resume", response_model=ProfileCreate)
async def parse_resume(
    file: UploadFile,
    user: User = Depends(current_user),
) -> ProfileCreate:
    """Extract structured profile data from an uploaded resume (PDF/DOCX/TXT).

    Returns the parsed fields for review; it does not persist a profile.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        text = resume_parser.extract_text(file.filename or "", data)
        parsed = await resume_parser.parse_resume(text, user.id)
        parsed["master_resume_text"] = text.strip()
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
    payload: ProfileCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    await _validate_resume_template(payload.resume_template_id, "resume", user, session)
    await _validate_resume_template(
        payload.cover_letter_template_id, "cover_letter", user, session
    )
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
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    await _validate_resume_template(payload.resume_template_id, "resume", user, session)
    await _validate_resume_template(
        payload.cover_letter_template_id, "cover_letter", user, session
    )
    for key, value in payload.model_dump().items():
        if key == "signature_data_url" and key not in payload.model_fields_set:
            continue
        setattr(profile, key, value)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.patch("/{profile_id}/additional-information", response_model=ProfileOut)
async def update_additional_information(
    profile_id: int,
    payload: ProfileAdditionalInformationUpdate,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.additional_information_items = payload.additional_information_items
    profile.additional_information = "\n".join(
        item.get("text", "").strip()
        for item in payload.additional_information_items
        if item.get("text", "").strip()
    ) or None
    await session.commit()
    await session.refresh(profile)
    return profile


@router.patch("/{profile_id}/resume-template", response_model=ProfileOut)
async def update_resume_template(
    profile_id: int,
    payload: ProfileTemplateUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if payload.document_type not in {"resume", "cover_letter"}:
        raise HTTPException(status_code=422, detail="Invalid template type")
    await _validate_resume_template(
        payload.template_id, payload.document_type, user, session
    )
    if payload.document_type == "resume":
        profile.resume_template_id = payload.template_id
    else:
        profile.cover_letter_template_id = payload.template_id
    await session.commit()
    await session.refresh(profile)
    return profile


@router.put("/{profile_id}/signature", response_model=ProfileOut)
async def upload_signature(
    profile_id: int,
    file: UploadFile,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    data = await file.read()
    mime_type = next(
        (mime for signature, mime in SIGNATURE_MIME_TYPES.items() if data.startswith(signature)),
        None,
    )
    if mime_type is None:
        raise HTTPException(status_code=422, detail="Upload a PNG or JPEG signature image")
    if not data or len(data) > MAX_SIGNATURE_SIZE:
        raise HTTPException(status_code=422, detail="Signature images must be 500 KB or smaller")
    profile.signature_data_url = f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"
    await session.commit()
    await session.refresh(profile)
    return profile


@router.delete("/{profile_id}/signature", response_model=ProfileOut)
async def delete_signature(
    profile_id: int,
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Profile:
    profile = await session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.signature_data_url = None
    await session.commit()
    await session.refresh(profile)
    return profile


@router.get("/{profile_id}/ignored-words", response_model=list[IgnoredWordOut])
async def list_ignored_words(
    profile_id: int, session: AsyncSession = Depends(get_session)
) -> list[IgnoredWord]:
    result = await session.execute(
        select(IgnoredWord)
        .where(IgnoredWord.profile_id == profile_id)
        .order_by(IgnoredWord.word)
    )
    return list(result.scalars().all())


@router.post(
    "/{profile_id}/ignored-words",
    response_model=IgnoredWordOut,
    status_code=201,
)
async def ignore_word(
    profile_id: int,
    payload: IgnoredWordCreate,
    session: AsyncSession = Depends(get_session),
) -> IgnoredWord:
    if await session.get(Profile, profile_id) is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    word = payload.word.strip().lower()
    if not word:
        raise HTTPException(status_code=422, detail="Word cannot be empty")

    existing = await session.scalar(
        select(IgnoredWord).where(
            IgnoredWord.profile_id == profile_id,
            IgnoredWord.word == word,
        )
    )
    if existing is not None:
        return existing

    ignored_word = IgnoredWord(profile_id=profile_id, word=word)
    session.add(ignored_word)
    await session.commit()
    await session.refresh(ignored_word)
    return ignored_word


@router.delete("/{profile_id}/ignored-words/{word}", status_code=204)
async def unignore_word(
    profile_id: int,
    word: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    await session.execute(
        delete(IgnoredWord).where(
            IgnoredWord.profile_id == profile_id,
            IgnoredWord.word == word.strip().lower(),
        )
    )
    await session.commit()
    return Response(status_code=204)
