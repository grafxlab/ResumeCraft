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
        # Rename the legacy resume_templates table before create_all so existing
        # data is preserved instead of orphaned under a new empty table.
        await conn.execute(
            text(
                "DO $$ BEGIN "
                "IF EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'resume_templates') "
                "AND NOT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'templates') THEN "
                "ALTER TABLE resume_templates RENAME TO templates; "
                "END IF; END $$;"
            )
        )
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE ai_usage_events "
                "ADD COLUMN IF NOT EXISTS user_id INTEGER "
                "REFERENCES users(id) ON DELETE SET NULL"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_id "
                "ON ai_usage_events (user_id)"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE ai_usage_events "
                "ADD COLUMN IF NOT EXISTS duration_ms DOUBLE PRECISION"
            )
        )
        # Self-heal the split-brain state where a legacy resume_templates table
        # lingers alongside templates: repoint the profile foreign keys to
        # templates and drop resume_templates when it holds no rows.
        await conn.execute(
            text(
                "DO $$ BEGIN "
                "IF EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'resume_templates') "
                "AND EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'templates') THEN "
                "IF EXISTS (SELECT 1 FROM pg_constraint "
                "WHERE conname = 'profiles_resume_template_id_fkey' "
                "AND confrelid = 'resume_templates'::regclass) THEN "
                "ALTER TABLE profiles DROP CONSTRAINT profiles_resume_template_id_fkey; "
                "ALTER TABLE profiles ADD CONSTRAINT profiles_resume_template_id_fkey "
                "FOREIGN KEY (resume_template_id) REFERENCES templates(id) ON DELETE SET NULL; "
                "END IF; "
                "IF EXISTS (SELECT 1 FROM pg_constraint "
                "WHERE conname = 'profiles_cover_letter_template_id_fkey' "
                "AND confrelid = 'resume_templates'::regclass) THEN "
                "ALTER TABLE profiles DROP CONSTRAINT profiles_cover_letter_template_id_fkey; "
                "ALTER TABLE profiles ADD CONSTRAINT profiles_cover_letter_template_id_fkey "
                "FOREIGN KEY (cover_letter_template_id) REFERENCES templates(id) ON DELETE SET NULL; "
                "END IF; "
                "IF NOT EXISTS (SELECT 1 FROM resume_templates) THEN "
                "DROP TABLE resume_templates; "
                "END IF; "
                "END IF; END $$;"
            )
        )

        # create_all does not add columns to existing development tables.
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "resume_template_id INTEGER REFERENCES templates(id) "
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
            text(
                "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS "
                "manual_source VARCHAR(100)"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS "
                "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_job_postings_user_id "
                "ON job_postings (user_id)"
            )
        )
        await conn.execute(
            text(
                "UPDATE job_postings SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) "
                "WHERE source = 'manual' AND user_id IS NULL "
                "AND (SELECT COUNT(*) FROM users) = 1"
            )
        )
        await conn.execute(
            text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS additional_information TEXT")
        )
        await conn.execute(
            text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS master_resume_text TEXT")
        )
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "additional_information_items JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "profile_link_items JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "
                "cover_letter_template_id INTEGER REFERENCES templates(id) "
                "ON DELETE SET NULL"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE templates ADD COLUMN IF NOT EXISTS "
                "document_type VARCHAR(20) NOT NULL DEFAULT 'resume'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "role VARCHAR(20) NOT NULL DEFAULT 'user'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "plan VARCHAR(20) NOT NULL DEFAULT 'trial'"
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_role ON users (role)")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_plan ON users (plan)")
        )
        await conn.execute(
            text(
                "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS "
                "salary_period VARCHAR(20)"
            )
        )

    from app.services.ai_usage import backfill_missing_ai_usage_costs
    from app.services.admin_bootstrap import bootstrap_admin

    await backfill_missing_ai_usage_costs()
    await bootstrap_admin()
