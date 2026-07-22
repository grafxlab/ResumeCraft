from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import User
from app.schemas import AuthSessionOut, AuthUserOut, LoginRequest, MessageOut, SignUpRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)
CONFIRMATION_MAX_AGE_SECONDS = 60 * 60 * 24
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.auth_secret_key, salt="resumecraft-auth")


def _user_out(user: User) -> AuthUserOut:
    return AuthUserOut(
        id=user.id,
        email=user.email,
        is_email_verified=user.is_email_verified,
    )


def _session_for(user: User) -> AuthSessionOut:
    token = _serializer().dumps({"user_id": user.id}, salt="session")
    return AuthSessionOut(token=token, user=_user_out(user))


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        payload = _serializer().loads(
            credentials.credentials,
            salt="session",
            max_age=SESSION_MAX_AGE_SECONDS,
        )
    except (BadSignature, SignatureExpired) as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc
    user = await session.get(User, payload.get("user_id"))
    if user is None:
        raise HTTPException(status_code=401, detail="Account not found")
    return user


def _send_confirmation_email(recipient: str, confirmation_url: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.warning("SMTP is not configured. Confirmation link for %s: %s", recipient, confirmation_url)
        return

    message = EmailMessage()
    message["Subject"] = "Confirm your ResumeCraft account"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        "Confirm your ResumeCraft account by opening this link:\n\n"
        f"{confirmation_url}\n\n"
        "This link expires in 24 hours."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def _send_confirmation(user: User) -> None:
    token = _serializer().dumps({"user_id": user.id}, salt="confirmation")
    confirmation_url = f"{settings.frontend_url}/?confirm_token={token}"
    await asyncio.to_thread(_send_confirmation_email, user.email, confirmation_url)


@router.post("/signup", response_model=MessageOut, status_code=201)
async def sign_up(
    payload: SignUpRequest, session: AsyncSession = Depends(get_session)
) -> MessageOut:
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, password_hash=password_hash.hash(payload.password))
        session.add(user)
        await session.commit()
        await session.refresh(user)
    elif user.is_email_verified:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    else:
        user.password_hash = password_hash.hash(payload.password)
        await session.commit()

    await _send_confirmation(user)
    return MessageOut(message="Check your email to confirm your account.")


@router.get("/confirm", response_model=AuthSessionOut)
async def confirm_email(
    token: str, session: AsyncSession = Depends(get_session)
) -> AuthSessionOut:
    try:
        payload = _serializer().loads(
            token, salt="confirmation", max_age=CONFIRMATION_MAX_AGE_SECONDS
        )
    except SignatureExpired as exc:
        raise HTTPException(status_code=400, detail="Confirmation link expired") from exc
    except BadSignature as exc:
        raise HTTPException(status_code=400, detail="Invalid confirmation link") from exc

    user = await session.get(User, payload.get("user_id"))
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    user.is_email_verified = True
    await session.commit()
    await session.refresh(user)
    return _session_for(user)


@router.post("/login", response_model=AuthSessionOut)
async def login(
    payload: LoginRequest, session: AsyncSession = Depends(get_session)
) -> AuthSessionOut:
    user = await session.scalar(
        select(User).where(User.email == payload.email.strip().lower())
    )
    if user is None or user.password_hash is None or not password_hash.verify(
        payload.password, user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_email_verified:
        await _send_confirmation(user)
        raise HTTPException(
            status_code=403,
            detail="Confirm your email first. A new confirmation link was sent.",
        )
    return _session_for(user)


@router.get("/me", response_model=AuthUserOut)
async def get_current_user(user: User = Depends(current_user)) -> AuthUserOut:
    return _user_out(user)


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    state = _serializer().dumps({"next": str(request.base_url)}, salt="google-state")
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": f"{request.base_url}api/auth/google/callback",
            "response_type": "code",
            "scope": "openid email",
            "state": state,
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RedirectResponse:
    try:
        _serializer().loads(state, salt="google-state", max_age=600)
    except (BadSignature, SignatureExpired) as exc:
        raise HTTPException(status_code=400, detail="Invalid Google sign-in request") from exc

    redirect_uri = f"{request.base_url}api/auth/google/callback"
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        profile_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile_response.raise_for_status()
        google_profile = profile_response.json()

    email = str(google_profile.get("email", "")).lower()
    subject = str(google_profile.get("sub", ""))
    if not email or not subject or not google_profile.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google did not provide a verified email")
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, google_subject=subject, is_email_verified=True)
        session.add(user)
    else:
        user.google_subject = subject
        user.is_email_verified = True
    await session.commit()
    await session.refresh(user)
    token = _session_for(user).token
    return RedirectResponse(f"{settings.frontend_url}/?auth_token={token}")