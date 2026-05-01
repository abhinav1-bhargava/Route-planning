"""Shared Claude (Anthropic) helpers used by every agent that wants LLM
narration or judgment. Each call site wraps these in try/except and falls
back to a deterministic path on any failure — so the demo NEVER stalls
because Claude was slow or returned malformed output."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-5"

_client: Any = None


def _get_client() -> Any:
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic()
    return _client


async def llm_text(
    prompt: str,
    *,
    system: str = "",
    max_tokens: int = 400,
    temperature: float = 0.3,
    model: str = DEFAULT_MODEL,
) -> str:
    """Send a single user message; return the assistant's text. Raises on
    SDK / network errors. Caller is expected to fall back gracefully."""
    client = _get_client()
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    resp = await client.messages.create(**kwargs)
    return "".join(getattr(b, "text", "") for b in resp.content).strip()


async def llm_json(
    prompt: str,
    *,
    system: str = "",
    max_tokens: int = 400,
    temperature: float = 0.2,
    model: str = DEFAULT_MODEL,
) -> dict:
    """Same as llm_text but parses the response as JSON, stripping common
    ```json fences. Raises on parse failure — caller falls back."""
    raw = await llm_text(
        prompt,
        system=system,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
    )
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return json.loads(raw)
