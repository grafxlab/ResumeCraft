from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Database
    database_url: str = "postgresql+asyncpg://jobs:jobs@localhost:5432/jobs"

    # Adzuna
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    adzuna_country: str = "us"

    # JSearch / RapidAPI
    rapidapi_key: str = ""
    jsearch_host: str = "jsearch.p.rapidapi.com"

    # LLM
    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-latest"

    # App
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
