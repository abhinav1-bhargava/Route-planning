"""Anomaly detection — fires on TASK_CREATED when a cluster of identical
task_types appears in the same area within a 4-hour window.

Zone matching is done by lat/lng proximity (~5 km box) since Task doesn't
carry an explicit zone field. The threshold is 3+ identical task_types.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from core.event_bus import EventBus, get_bus, new_correlation_id
from core.models import Event, EventType

logger = logging.getLogger(__name__)

PROXIMITY_DEG = 0.05            # ~5 km box at Gurugram latitude
WINDOW_HOURS = 4
CLUSTER_THRESHOLD = 3            # 3+ matching tasks (including the new one)


def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


async def handle_task_created(event: Event) -> None:
    """Subscribed to TASK_CREATED.

    Anomaly detection counts ONLY recent ad-hoc TASK_CREATED events of
    the same task_type — never the seeded planned tasks. The 25 planned
    tasks already cluster geographically by design (workers have nearby
    queues), so counting them lights up an anomaly on every cold start.
    """
    payload = event.payload or {}
    task_id = payload.get("task_id")
    if not task_id:
        return
    store = _resolve_state_store()
    new_task = await store.get_task(task_id)
    if new_task is None:
        return

    # Only run anomaly logic for ad-hoc tasks; seed (planned) tasks are
    # not signal.
    if new_task.type != "adhoc":
        return

    # Pull recent TASK_CREATED events (last WINDOW_HOURS) and keep only
    # those tagged as ad-hoc + same task_type, within proximity. Reading
    # from the event log avoids reaching into the tasks table for
    # historical context (the tasks table is a snapshot, not a journal).
    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    recent_events = await store.list_events()
    adhoc_events: list[Any] = []
    for e in recent_events:
        if e.event_type != EventType.TASK_CREATED:
            continue
        if e.id == event.id:
            continue
        ts = getattr(e, "timestamp", None)
        if ts is not None:
            ts_aware = (
                ts if ts.tzinfo is not None
                else ts.replace(tzinfo=timezone.utc)
            )
            if ts_aware < cutoff:
                continue
        ep = e.payload or {}
        # Re-fetch the task to confirm it's ad-hoc + same task_type +
        # spatially close. payload.scenario or payload.scenario_name is a
        # reliable hint (scenarios are the only ad-hoc producers in this
        # demo) but we verify via the task record so the rule survives
        # any future ad-hoc paths.
        e_tid = ep.get("task_id")
        if not e_tid:
            continue
        e_task = await store.get_task(e_tid)
        if e_task is None or e_task.type != "adhoc":
            continue
        if e_task.task_type != new_task.task_type:
            continue
        if (
            abs(e_task.location_lat - new_task.location_lat) >= PROXIMITY_DEG
            or abs(e_task.location_lng - new_task.location_lng) >= PROXIMITY_DEG
        ):
            continue
        adhoc_events.append(e_task)
    total = len(adhoc_events) + 1
    if total < CLUSTER_THRESHOLD:
        return
    cluster = adhoc_events

    # Don't fire twice for the same correlation_id.
    existing = await store.list_events(correlation_id=event.correlation_id)
    if any(e.event_type == EventType.ANOMALY_DETECTED for e in existing):
        return

    # Approximate "zone" from coordinates — use the seed table.
    from data.seed import WORKERS as _SEED_WORKERS
    nearest = min(
        _SEED_WORKERS,
        key=lambda w: (
            (w["lat"] - new_task.location_lat) ** 2
            + (w["lng"] - new_task.location_lng) ** 2
        ),
    )
    zone = nearest.get("zone", "this area")

    task_list_text = "\n".join(
        f"  - {t.id} at {t.address} (scheduled {t.scheduled_time})"
        for t in cluster
    )
    task_list_text += (
        f"\n  - {new_task.id} at {new_task.address} (just reported)"
    )

    detected = False
    pattern_description = ""
    recommendation: str | None = None
    confidence = "medium"
    try:
        from core.llm import llm_json
        data = await llm_json(
            f"You are monitoring field operations for a telecom company "
            f"in Gurugram.\n\n"
            f"Recent pattern detected in {zone}:\n"
            f"{task_list_text}\n"
            f"(all {new_task.task_type} tasks in the last "
            f"{WINDOW_HOURS} hours)\n\n"
            f"A new {new_task.task_type} has just been reported in the "
            f"same area, making {total} total.\n\n"
            f"Assess whether this suggests a systemic infrastructure "
            f"issue rather than isolated incidents.\n\n"
            f'Respond as JSON: {{"anomaly_detected": bool, '
            f'"confidence": "low"|"medium"|"high", '
            f'"pattern_description": str, "recommendation": str|null, '
            f'"recommended_action": "schedule_network_rehab"|"escalate"|'
            f'"monitor"|null}}',
            max_tokens=400,
            temperature=0.2,
        )
        detected = bool(data.get("anomaly_detected"))
        confidence = str(data.get("confidence") or "medium")
        pattern_description = str(data.get("pattern_description") or "")
        recommendation = data.get("recommendation")
    except Exception:
        logger.warning(
            "LLM anomaly detection failed; using deterministic threshold"
        )
        detected = total >= CLUSTER_THRESHOLD
        pattern_description = (
            f"{total} {new_task.task_type.replace('_', ' ')} tasks "
            f"clustered in {zone}"
        )
        recommendation = (
            "Schedule a node inspection / network rehab for this area"
            if new_task.task_type in ("fault_repair", "fiber_cut")
            else "Monitor for further reports"
        )

    if not detected:
        return

    label = (
        f"⚠️ Pattern detected — {total} "
        f"{new_task.task_type.replace('_', ' ')} jobs in {zone} today. "
        f"{pattern_description}."
    )
    if recommendation:
        label += f" Recommendation: {recommendation}"

    out = Event(
        event_type=EventType.ANOMALY_DETECTED,
        payload={
            "task_type": new_task.task_type,
            "zone": zone,
            "count": total,
            "confidence": confidence,
            "pattern_description": pattern_description,
            "recommendation": recommendation,
            "trigger_task_id": new_task.id,
        },
        agent="anomaly",
        correlation_id=event.correlation_id or new_correlation_id(),
        human_label=label,
    )
    bus = get_bus()
    await bus.publish(out)
    try:
        await store.save_event(out)
    except Exception:
        logger.exception("failed to persist ANOMALY_DETECTED")


def register(bus: EventBus) -> None:
    """Wire handle_task_created to TASK_CREATED. Called from api/main.py."""
    bus.subscribe(EventType.TASK_CREATED, handle_task_created)
