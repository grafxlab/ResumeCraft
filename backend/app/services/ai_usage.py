from __future__ import annotations

import logging

from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models import AIUsageEvent
from app.services.ai_models import pricing_details

logger = logging.getLogger("resumecraft")


def estimated_cost(
    input_tokens: int | None,
    output_tokens: int | None,
    provider: str | None = None,
    model: str | None = None,
) -> float | None:
    pricing = pricing_details(provider, model) if provider and model else None
    input_rate = pricing["input_price"] if pricing else settings.llm_input_cost_per_million
    output_rate = pricing["output_price"] if pricing else settings.llm_output_cost_per_million
    if input_rate is None or output_rate is None:
        return None
    return round(
        ((input_tokens or 0) * input_rate + (output_tokens or 0) * output_rate)
        / 1_000_000,
        8,
    )


async def record_ai_usage(
    *,
    provider: str,
    model: str,
    operation: str,
    user_id: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    duration_ms: float | None = None,
    successful: bool = True,
    error: str | None = None,
) -> None:
    try:
        async with async_session_factory() as session:
            session.add(
                AIUsageEvent(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    operation=operation,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=(input_tokens or 0) + (output_tokens or 0)
                    if input_tokens is not None or output_tokens is not None
                    else None,
                    estimated_cost_usd=estimated_cost(
                        input_tokens, output_tokens, provider, model
                    ),
                    duration_ms=duration_ms,
                    successful=successful,
                    error=error,
                )
            )
            await session.commit()
    except Exception:  # noqa: BLE001 - telemetry must never break an AI request
        logger.exception("Failed to write AI usage event")


async def backfill_missing_ai_usage_costs() -> int:
    """Price historical events once a provider/model rate becomes known."""
    updated = 0
    async with async_session_factory() as session:
        events = (
            await session.scalars(
                select(AIUsageEvent).where(
                    AIUsageEvent.estimated_cost_usd.is_(None),
                    AIUsageEvent.input_tokens.is_not(None),
                    AIUsageEvent.output_tokens.is_not(None),
                )
            )
        ).all()
        for event in events:
            cost = estimated_cost(
                event.input_tokens,
                event.output_tokens,
                event.provider,
                event.model,
            )
            if cost is not None:
                event.estimated_cost_usd = cost
                updated += 1
        if updated:
            await session.commit()
    return updated