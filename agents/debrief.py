"""Debrief agent — fires after every non-startup ROUTE_UPDATED.

Reads the full event chain for the correlation, asks Claude to write a
shift-handover paragraph, and emits DEBRIEF_READY. The paragraph is
shown as a distinct "SHIFT NOTE" card in the dashboard event log and
attached to the WFM payload's scenario summary.
"""

from __future__ import annotations

import logging
from typing import Any

from core.event_bus import EventBus, get_bus, new_correlation_id
from core.models import Event, EventType

logger = logging.getLogger(__name__)


def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


_DEBRIEF_FALLBACK = (
    "Scenario completed. The system processed the request and updated "
    "the affected technician's route. See event log for details."
)


async def handle_route_updated(event: Event) -> None:
    """Subscribed to ROUTE_UPDATED. Skips startup runs."""
    corr_id = event.correlation_id
    if not corr_id or corr_id.startswith("startup-"):
        return
    store = _resolve_state_store()
    bus = get_bus()

    # Avoid emitting twice for the same correlation (route_planner can
    # emit ROUTE_UPDATED multiple times per flow if there's a re-plan).
    existing = await store.list_events(correlation_id=corr_id)
    if any(e.event_type == EventType.DEBRIEF_READY for e in existing):
        return

    try:
        from core.llm import llm_text
        chain_lines: list[str] = []
        for e in sorted(existing, key=lambda e: e.timestamp):
            ts = str(e.timestamp)[11:19] if len(str(e.timestamp)) >= 19 else "—"
            chain_lines.append(
                f"  {ts} [{e.event_type}] {e.human_label}"
            )
        chain_text = "\n".join(chain_lines) or "(no events)"

        prompt = (
            f"You are writing a shift handover note for a field "
            f"operations manager.\n\n"
            f"Here is what just happened in the system:\n{chain_text}\n\n"
            f"Write a single paragraph (60-80 words) covering:\n"
            f"1. What triggered the response (task type, location)\n"
            f"2. Which technician was selected and the key reason\n"
            f"3. Any trade-offs made (consent, rescheduling)\n"
            f"4. The final outcome (route stats, completion time)\n\n"
            f"Write in past tense. Plain English. Sound like a competent "
            f"shift supervisor wrote it. No bullet points. No jargon. "
            f"No system terms. Return only the paragraph."
        )
        paragraph = (await llm_text(
            prompt, max_tokens=400, temperature=0.45,
        )).strip().strip('"')
        if not paragraph:
            paragraph = _DEBRIEF_FALLBACK
    except Exception:
        logger.warning("LLM debrief generation failed; using fallback")
        paragraph = _DEBRIEF_FALLBACK

    # Try to find the scenario name from the original TASK_CREATED event.
    scenario_name = None
    for e in existing:
        if e.event_type == EventType.TASK_CREATED:
            sn = e.payload.get("scenario_name") if e.payload else None
            if sn:
                scenario_name = str(sn)
            break

    out = Event(
        event_type=EventType.DEBRIEF_READY,
        payload={
            "correlation_id": corr_id,
            "paragraph": paragraph,
            "worker_id": (event.payload or {}).get("worker_id"),
            "scenario_name": scenario_name,
        },
        agent="debrief",
        correlation_id=corr_id or new_correlation_id(),
        human_label=paragraph,
    )
    await bus.publish(out)
    try:
        await store.save_event(out)
    except Exception:
        logger.exception("failed to persist DEBRIEF_READY (non-fatal)")


def register(bus: EventBus) -> None:
    """Wire handle_route_updated to ROUTE_UPDATED. Called from
    api/main.py lifespan after route_planner.register."""
    bus.subscribe(EventType.ROUTE_UPDATED, handle_route_updated)
