from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models import AIModelSelection, AIProviderSelection

PRICING_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing"
OPENAI_PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing"
SONNET_5_STANDARD_PRICING_START = datetime(2026, 9, 1, tzinfo=UTC)

ANTHROPIC_MODELS = (
    {
        "id": "claude-sonnet-5-0",
        "name": "Claude Sonnet 5",
        "input_price": 2.0,
        "output_price": 10.0,
        "note": "Introductory pricing through August 31, 2026; then $3 / $15 per MTok.",
    },
    {"id": "claude-opus-4-8", "name": "Claude Opus 4.8", "input_price": 5.0, "output_price": 25.0},
    {"id": "claude-opus-4-7", "name": "Claude Opus 4.7", "input_price": 5.0, "output_price": 25.0},
    {"id": "claude-opus-4-6", "name": "Claude Opus 4.6", "input_price": 5.0, "output_price": 25.0},
    {"id": "claude-opus-4-5", "name": "Claude Opus 4.5", "input_price": 5.0, "output_price": 25.0},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "input_price": 3.0, "output_price": 15.0},
    {"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "input_price": 3.0, "output_price": 15.0},
    {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "input_price": 1.0, "output_price": 5.0},
)

OPENAI_MODELS = (
    {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "input_price": 5.0, "cached_input_price": 0.5, "output_price": 30.0},
    {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "input_price": 2.5, "cached_input_price": 0.25, "output_price": 15.0},
    {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "input_price": 1.0, "cached_input_price": 0.1, "output_price": 6.0},
    {"id": "gpt-5.5", "name": "GPT-5.5", "input_price": 5.0, "cached_input_price": 0.5, "output_price": 30.0},
    {"id": "gpt-5.5-pro", "name": "GPT-5.5 Pro", "input_price": 30.0, "cached_input_price": None, "output_price": 180.0},
    {"id": "gpt-5.4", "name": "GPT-5.4", "input_price": 2.5, "cached_input_price": 0.25, "output_price": 15.0},
    {"id": "gpt-5.4-mini", "name": "GPT-5.4 Mini", "input_price": 0.75, "cached_input_price": 0.075, "output_price": 4.5},
    {"id": "gpt-5.4-nano", "name": "GPT-5.4 Nano", "input_price": 0.2, "cached_input_price": 0.02, "output_price": 1.25},
    {"id": "gpt-5.4-pro", "name": "GPT-5.4 Pro", "input_price": 30.0, "cached_input_price": None, "output_price": 180.0},
    {"id": "gpt-4.1", "name": "GPT-4.1", "input_price": 2.0, "cached_input_price": 0.5, "output_price": 8.0},
    {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "input_price": 0.4, "cached_input_price": 0.1, "output_price": 1.6},
    {"id": "gpt-4.1-nano", "name": "GPT-4.1 Nano", "input_price": 0.1, "cached_input_price": 0.025, "output_price": 0.4},
    {"id": "gpt-4o", "name": "GPT-4o", "input_price": 2.5, "cached_input_price": 1.25, "output_price": 10.0},
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "input_price": 0.15, "cached_input_price": 0.075, "output_price": 0.6},
)

MODEL_SELECTION_IDS = {"anthropic": 1, "openai": 2}


def model_details(model_id: str, at: datetime | None = None) -> dict | None:
    model = next((item for item in ANTHROPIC_MODELS if item["id"] == model_id), None)
    if model is None:
        return None
    details = dict(model)
    if model_id == "claude-sonnet-5-0" and (at or datetime.now(UTC)) >= SONNET_5_STANDARD_PRICING_START:
        details["input_price"] = 3.0
        details["output_price"] = 15.0
        details["note"] = "Standard pricing effective September 1, 2026."
    return details


def openai_model_details(model_id: str) -> dict | None:
    model = next((item for item in OPENAI_MODELS if item["id"] == model_id), None)
    return dict(model) if model else None


def pricing_details(provider: str, model_id: str) -> dict | None:
    if provider == "anthropic":
        return model_details(model_id)
    if provider == "openai":
        return openai_model_details(model_id)
    return None


async def active_provider() -> str:
    try:
        async with async_session_factory() as session:
            selected = await session.scalar(
                select(AIProviderSelection.provider).where(AIProviderSelection.id == 1)
            )
            if selected in MODEL_SELECTION_IDS:
                return selected
    except Exception:
        pass
    return settings.llm_provider.lower()


async def active_model(provider: str) -> str:
    fallback = settings.anthropic_model if provider == "anthropic" else settings.openai_model
    selection_id = MODEL_SELECTION_IDS.get(provider)
    if selection_id is None:
        return fallback
    try:
        async with async_session_factory() as session:
            selected = await session.scalar(
                select(AIModelSelection.model).where(AIModelSelection.id == selection_id)
            )
            if selected and pricing_details(provider, selected):
                return selected
    except Exception:
        pass
    return fallback


async def active_anthropic_model() -> str:
    return await active_model("anthropic")