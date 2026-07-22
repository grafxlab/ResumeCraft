from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, future=True)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def init_db() -> None:
    """Create tables. For production use Alembic migrations instead."""
    # Import models so they are registered on the metadata before create_all.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all does not add columns to existing development tables.
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "resume_template_id INTEGER REFERENCES resume_templates(id) "
                "ON DELETE SET NULL"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_profiles_resume_template_id "
                "ON profiles (resume_template_id)"
            )
        )
        await conn.execute(
            text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_content TEXT")
        )
        await conn.execute(
            text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS rendered_html TEXT")
        )
        await conn.execute(
            text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS additional_information TEXT")
        )
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "cover_letter_template_id INTEGER REFERENCES resume_templates(id) "
                "ON DELETE SET NULL"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE resume_templates ADD COLUMN IF NOT EXISTS "
                "document_type VARCHAR(20) NOT NULL DEFAULT 'resume'"
            )
        )
