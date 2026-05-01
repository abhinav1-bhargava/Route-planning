"""Consent agent — LLM-composed Telegram messaging + reply/timeout handling.

Subscribes to CONSENT_REQUIRED. For a displaced task that needs customer
consent, asks Claude to write a short Telegram message explaining the
reschedule. Persists a ConsentRequest row, sends via the Telegram bot
(which appends a short code for reply matching), waits up to
CONSENT_TIMEOUT_MINS for yes/no (with one re-prompt on ambiguity managed
inside the bot). Emits CONSENT_RESOLVED either way.

The 11-min reallocation lock held by reallocation.py covers this round
trip (10 min timeout + 1 min grace). When CONSENT_RESOLVED fires, the
supervisor releases the lock.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from core.event_bus import EventBus, get_bus, new_correlation_id
from core.models import ConsentRequest, Event, EventType, Task

logger = logging.getLogger(__name__)

CONSENT_MODEL: str = "claude-sonnet-4-5"
CONSENT_TIMEOUT_MINS: int = 10
CONSENT_MAX_TOKENS: int = 400
CONSENT_TEMPERATURE: float = 0.4


@dataclass(frozen=True)
class ComposedMessage:
    text: str
    old_time: str
    new_time: str
    task_address: str


# ---- resolvers (test-patchable) -------------------------------------------

def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


def _resolve_telegram_bot() -> Any:
    from integrations.telegram_bot import get_bot
    return get_bot()


_anthropic_client: Any = None


def _get_anthropic_client() -> Any:
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import AsyncAnthropic
        _anthropic_client = AsyncAnthropic()
    return _anthropic_client


# ---- helpers --------------------------------------------------------------

def _format_consent_message(
    adhoc_task: Task,
    displaced_task: Task,
    old_time: str,
    new_time: str,
    worker_name: str,
) -> str:
    """Deterministic consent message template per the spec. No LLM — the
    message is structured so the customer sees the exact ask, and inline
    YES/NO buttons are attached by the bot."""
    pretty_displaced = displaced_task.task_type.replace("_", " ").title()
    pretty_adhoc = adhoc_task.task_type.replace("_", " ")
    pretty_displaced_lc = displaced_task.task_type.replace("_", " ")
    return (
        f"{pretty_displaced} Reschedule Request\n\n"
        f"We have an urgent {pretty_adhoc} at {adhoc_task.address}.\n\n"
        f"To send our nearest technician we need to move your scheduled "
        f"{pretty_displaced_lc}:\n\n"
        f"📍 Location: {displaced_task.address}\n"
        f"🕐 Current time: {old_time}\n"
        f"🕑 Proposed new time: {new_time}\n"
        f"👤 Technician: {worker_name}\n\n"
        f"Can you confirm the reschedule?"
    )


_CONSENT_SYSTEM_PROMPT = """You are writing a customer notification message for a telecom field service company in India.
The message will be sent via Telegram.

Style: conversational, brief, respectful
Tone: like a helpful customer service agent
Length: 3-4 sentences maximum
Language: simple English, no jargon
Do not mention system names, agent names, or technical terms
End with a clear question asking for confirmation"""


async def compose_message(
    adhoc_task: Task,
    displaced_task: Task,
    proposed_old_time: str,
    proposed_new_time: str,
    worker_name: str = "",
) -> ComposedMessage:
    """LLM-composed consent message with deterministic template fallback.
    The inline YES/NO keyboard is added by the bot after this returns."""
    text: str | None = None
    try:
        from core.llm import llm_text
        # Compute time delta in minutes for the prompt — easier than
        # making the LLM parse two HH:MM strings.
        def _hm(s: str) -> int:
            h, m = s.split(":")
            return int(h) * 60 + int(m)
        delta = _hm(proposed_new_time) - _hm(proposed_old_time)
        delta_word = "later" if delta > 0 else "earlier"
        prompt = (
            f"Situation:\n"
            f"We have an urgent {adhoc_task.task_type.replace('_',' ')} "
            f"emergency at {adhoc_task.address}.\n\n"
            f"The customer has a "
            f"{displaced_task.task_type.replace('_',' ')} scheduled at "
            f"their location:\n"
            f"  Address: {displaced_task.address}\n"
            f"  Current time: {proposed_old_time}\n"
            f"  Proposed new time: {proposed_new_time}\n"
            f"  Time change: {abs(delta)} minutes {delta_word}\n\n"
            f"Our technician {worker_name} can handle both if the "
            f"customer agrees to the reschedule.\n\n"
            f"Write the Telegram message to the customer asking them to "
            f"confirm the time change. Return only the message text, "
            f"nothing else."
        )
        text = (await llm_text(
            prompt,
            system=_CONSENT_SYSTEM_PROMPT,
            max_tokens=300,
            temperature=0.45,
        )).strip().strip('"')
        if not text:
            raise ValueError("empty LLM response")
    except Exception:
        logger.warning(
            "LLM consent message composition failed; using deterministic template"
        )
        text = _format_consent_message(
            adhoc_task, displaced_task, proposed_old_time,
            proposed_new_time, worker_name,
        )
    return ComposedMessage(
        text=text,
        old_time=proposed_old_time,
        new_time=proposed_new_time,
        task_address=displaced_task.address,
    )


async def _compose_followup(
    outcome: str,
    *,
    displaced_task: Task,
    worker_name: str,
    old_time: str,
    new_time: str,
) -> str:
    """LLM-composed follow-up SMS sent after CONSENT_RESOLVED. Falls back
    to a fixed template on LLM error."""
    try:
        from core.llm import llm_text
        if outcome == "yes":
            prompt = (
                f"A customer confirmed a reschedule for their "
                f"{displaced_task.task_type.replace('_',' ')} service "
                f"appointment.\n\n"
                f"Details:\n"
                f"  Technician: {worker_name}\n"
                f"  New arrival time: {new_time}\n"
                f"  Location: {displaced_task.address}\n"
                f"  Reference: {displaced_task.id}\n\n"
                f"Write a brief confirmation SMS (2 sentences max). "
                f"Friendly, professional tone. Include technician name "
                f"and new arrival time. Return only the message text."
            )
        else:
            prompt = (
                f"A customer declined to reschedule their "
                f"{displaced_task.task_type.replace('_',' ')} appointment.\n\n"
                f"Their original time {old_time} is kept.\n"
                f"Write a brief acknowledgement (1-2 sentences). "
                f"Thank them, confirm original appointment unchanged. "
                f"Friendly tone. Return only the message text."
            )
        return (await llm_text(
            prompt, max_tokens=200, temperature=0.4,
        )).strip().strip('"')
    except Exception:
        logger.warning("LLM follow-up composition failed; using template")
        if outcome == "yes":
            return (
                f"Confirmed — {worker_name} will arrive at {new_time}. "
                f"Thank you for your flexibility."
            )
        return (
            f"No problem — your appointment at {old_time} is unchanged. "
            f"Thanks for letting us know."
        )


# ---- event handler --------------------------------------------------------

async def handle_consent_required(event: Event) -> None:
    """Subscribed to CONSENT_REQUIRED."""
    corr_id = event.correlation_id or new_correlation_id()
    p = event.payload
    worker_id = p.get("worker_id")
    adhoc_id = p.get("adhoc_task_id")
    displaced_id = p.get("displaced_task_id")
    proposed_old = p.get("proposed_old_time")
    proposed_new = p.get("proposed_new_time")
    if not all([worker_id, adhoc_id, displaced_id, proposed_old, proposed_new]):
        logger.error(
            "CONSENT_REQUIRED missing fields; payload=%r correlation_id=%s",
            p, corr_id,
        )
        return

    store = _resolve_state_store()
    bot = _resolve_telegram_bot()
    bus = get_bus()

    # Dedup guard — if a CONSENT_SENT already exists for this correlation,
    # we've already sent the message and are waiting on the bot future.
    # A second CONSENT_REQUIRED for the same correlation_id would otherwise
    # fire a second Telegram message, which is what the demo run flagged.
    existing = await store.list_events(correlation_id=corr_id)
    if any(e.event_type == EventType.CONSENT_SENT for e in existing):
        logger.warning(
            "CONSENT_REQUIRED for correlation %s already has CONSENT_SENT — "
            "skipping duplicate Telegram send", corr_id,
        )
        return

    adhoc = await store.get_task(adhoc_id)
    displaced = await store.get_task(displaced_id)
    if adhoc is None or displaced is None:
        logger.error(
            "CONSENT_REQUIRED for unknown task(s) adhoc=%s displaced=%s",
            adhoc_id, displaced_id,
        )
        return

    # Fetch the worker's name for the message template.
    worker_obj = await store.get_worker(worker_id)
    worker_name = worker_obj.name if worker_obj else worker_id

    # Compose the consent message (deterministic template + buttons).
    composed = await compose_message(
        adhoc, displaced, proposed_old, proposed_new, worker_name=worker_name,
    )

    # Persist ConsentRequest BEFORE sending to Telegram. The ConsentRequest
    # id doubles as the request_id in the Telegram callback_data — every
    # button press carries it back.
    req_id = str(uuid4())
    chat_id = os.getenv("TELEGRAM_CUSTOMER_CHAT_ID", "")
    cr = ConsentRequest(
        id=req_id,
        task_id=displaced_id,
        customer_phone=chat_id,
        message_text=composed.text,
        sent_at=datetime.now(timezone.utc),
        response=None,
        resolved_at=None,
        timeout_mins=CONSENT_TIMEOUT_MINS,
    )
    await store.save_consent_request(cr)

    # Send Telegram. On send failure, resolve as timeout (fail-safe).
    started = datetime.now(timezone.utc)
    try:
        await bot.send_consent_message(composed.text, request_id=req_id)
        sent_event = Event(
            event_type=EventType.CONSENT_SENT,
            payload={
                "worker_id": worker_id,
                "worker_name": worker_name,
                "adhoc_task_id": adhoc_id,
                "displaced_task_id": displaced_id,
                "request_id": req_id,
                "old_time": proposed_old,
                "new_time": proposed_new,
                "task_type": displaced.task_type,
            },
            agent="consent",
            correlation_id=corr_id,
            human_label=(
                "📱 Consent request sent to customer.\n"
                "Waiting for reply — 10 minute window.\n"
                "(Presenter: tap YES or NO on the demo phone)"
            ),
        )
        await bus.publish(sent_event)
        await store.save_event(sent_event)
    except Exception:
        logger.exception(
            "Telegram send failed for consent request %s; resolving as timeout",
            req_id,
        )
        await store.update_consent_response(req_id, "timeout")
        out = Event(
            event_type=EventType.CONSENT_RESOLVED,
            payload={
                "worker_id": worker_id,
                "adhoc_task_id": adhoc_id,
                "displaced_task_id": displaced_id,
                "outcome": "timeout",
                "raw_reply": None,
                "elapsed_mins": 0.0,
                "request_id": req_id,
                "short_code": None,
            },
            agent="consent",
            correlation_id=corr_id,
            human_label="Could not deliver Telegram consent message; timing out.",
        )
        await bus.publish(out)
        await store.save_event(out)
        return

    # Await reply within the timeout window.
    outcome: Literal["yes", "no", "timeout"]
    raw_reply: str | None
    try:
        # Hand the LLM intent classifier a one-line summary of what we
        # actually asked the customer, so its yes/no judgment is grounded
        # in the specific request rather than a generic "reschedule".
        consent_context = (
            f"Field-service reschedule request — moving the {displaced.task_type} "
            f"job at {displaced.address[:60]} from {proposed_old} to {proposed_new}."
        )
        outcome_yn, raw_reply = await bot.await_reply(
            req_id,
            timeout_secs=CONSENT_TIMEOUT_MINS * 60,
            context=consent_context,
        )
        outcome = outcome_yn
    except asyncio.TimeoutError:
        outcome = "timeout"
        raw_reply = None

    elapsed_mins = (
        datetime.now(timezone.utc) - started
    ).total_seconds() / 60.0

    # Persist final response.
    await store.update_consent_response(req_id, outcome)

    # Send follow-up to the customer for yes/no (skip on timeout — there's
    # no one listening at the other end). LLM-composed with template
    # fallback. Failures here never block CONSENT_RESOLVED.
    if outcome in ("yes", "no"):
        try:
            followup_text = await _compose_followup(
                outcome,
                displaced_task=displaced,
                worker_name=worker_name,
                old_time=proposed_old,
                new_time=proposed_new,
            )
            await bot.send_message(followup_text)
        except Exception:
            logger.exception(
                "follow-up Telegram send failed (non-fatal)"
            )

    # Emit CONSENT_RESOLVED.
    if outcome == "yes":
        human = "Customer confirmed the reschedule ✅"
    elif outcome == "no":
        human = (
            "Customer declined — keeping the original slot, finding an alternative"
        )
    else:
        human = (
            "⏱ No customer reply after 10 minutes — escalating to dispatcher"
        )
    out = Event(
        event_type=EventType.CONSENT_RESOLVED,
        payload={
            "worker_id": worker_id,
            "adhoc_task_id": adhoc_id,
            "displaced_task_id": displaced_id,
            "outcome": outcome,
            "raw_reply": raw_reply,
            "elapsed_mins": round(elapsed_mins, 2),
            "request_id": req_id,
        },
        agent="consent",
        correlation_id=corr_id,
        human_label=human,
    )
    await bus.publish(out)
    await store.save_event(out)


def register(bus: EventBus) -> None:
    """Wire handle_consent_required to CONSENT_REQUIRED."""
    bus.subscribe(EventType.CONSENT_REQUIRED, handle_consent_required)
