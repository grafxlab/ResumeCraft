from __future__ import annotations

import logging

from pwdlib import PasswordHash
from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models import User

logger = logging.getLogger(__name__)
password_hash = PasswordHash.recommended()


async def bootstrap_admin() -> None:
    email = settings.default_admin_email.strip().lower()
    if not email:
        return
    async with async_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            if len(settings.default_admin_password) < 8:
                logger.error(
                    "DEFAULT_ADMIN_PASSWORD must contain at least 8 characters "
                    "when creating the default administrator"
                )
                return
            user = User(
                email=email,
                password_hash=password_hash.hash(settings.default_admin_password),
                is_email_verified=True,
                role="admin",
                plan="power",
            )
            session.add(user)
        else:
            user.role = "admin"
            user.is_email_verified = True
        await session.commit()
