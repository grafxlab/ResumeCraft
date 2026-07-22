from __future__ import annotations

from app.config import settings


class LLMError(RuntimeError):
    pass


async def complete(system: str, prompt: str, max_tokens: int = 1500) -> str:
    """Provider-agnostic text completion.

    Configured via LLM_PROVIDER (openai | anthropic). Returns plain text.
    """
    provider = settings.llm_provider.lower()

    if provider == "openai":
        return await _openai_complete(system, prompt, max_tokens)
    if provider == "anthropic":
        return await _anthropic_complete(system, prompt, max_tokens)
    raise LLMError(f"Unknown LLM provider: {provider}")


async def _openai_complete(system: str, prompt: str, max_tokens: int) -> str:
    if not settings.openai_api_key:
        raise LLMError("OPENAI_API_KEY is not configured.")

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content or ""


async def _anthropic_complete(system: str, prompt: str, max_tokens: int) -> str:
    if not settings.anthropic_api_key:
        raise LLMError("ANTHROPIC_API_KEY is not configured.")

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    resp = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")
