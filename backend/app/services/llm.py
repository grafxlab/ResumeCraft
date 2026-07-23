from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter

from app.config import settings
from app.services.ai_usage import record_ai_usage
from app.services.ai_models import active_model, active_provider


class LLMError(RuntimeError):
    pass


@dataclass
class CompletionResult:
    text: str
    input_tokens: int | None
    output_tokens: int | None


async def complete(
    system: str,
    prompt: str,
    max_tokens: int = 1500,
    operation: str = "other",
    user_id: int | None = None,
) -> str:
    """Provider-agnostic text completion.

    Configured via LLM_PROVIDER (openai | anthropic). Returns plain text.
    """
    provider = await active_provider()
    model = await active_model(provider)
    started_at = perf_counter()

    try:
        if provider == "openai":
            result = await _openai_complete(system, prompt, max_tokens, model)
        elif provider == "anthropic":
            result = await _anthropic_complete(system, prompt, max_tokens, model)
        else:
            raise LLMError(f"Unknown LLM provider: {provider}")
        await record_ai_usage(
            provider=provider,
            model=model,
            operation=operation,
            user_id=user_id,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
        )
        return result.text
    except Exception as exc:  # Provider SDKs use distinct exception hierarchies.
        error = exc if isinstance(exc, LLMError) else LLMError(
            f"{provider.title()} request failed: {exc}"
        )
        await record_ai_usage(
            provider=provider,
            model=model,
            operation=operation,
            user_id=user_id,
            duration_ms=round((perf_counter() - started_at) * 1000, 2),
            successful=False,
            error=str(error),
        )
        raise error from exc


async def _openai_complete(
    system: str, prompt: str, max_tokens: int, model: str
) -> CompletionResult:
    if not settings.openai_api_key:
        raise LLMError("OPENAI_API_KEY is not configured.")

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    request = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    if model.startswith("gpt-5"):
        request["max_completion_tokens"] = max_tokens
    else:
        request["max_tokens"] = max_tokens
    resp = await client.chat.completions.create(**request)
    return CompletionResult(
        text=resp.choices[0].message.content or "",
        input_tokens=resp.usage.prompt_tokens if resp.usage else None,
        output_tokens=resp.usage.completion_tokens if resp.usage else None,
    )


async def _anthropic_complete(
    system: str, prompt: str, max_tokens: int, model: str
) -> CompletionResult:
    if not settings.anthropic_api_key:
        raise LLMError("ANTHROPIC_API_KEY is not configured.")

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return CompletionResult(
        text="".join(block.text for block in resp.content if block.type == "text"),
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
    )
