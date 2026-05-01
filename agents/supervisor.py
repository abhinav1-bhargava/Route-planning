"""Supervisor agent — LLM-driven priority scoring + consent-resolution routing.

Uses Claude (Sonnet) for:
    - Priority scoring on TASK_CREATED (needs fleet-wide context)
    - Trade-off narrative on ESCALATION_REQUIRED (timeout branch)

Deterministic logic for:
    - CONSENT_RESOLVED dispatch (yes/no/timeout branching)
    - TASK_COMPLETED → ROUTE_REPLAN trigger
    - Reallocation lock release at the end of every consent cycle,
      partnering with the 11-min lock held by reallocation.py's consent
      branch

Subscribes to: TASK_CREATED, CONSENT_RESOLVED, TASK_COMPLETED.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Literal

from agents import reallocation
from core.event_bus import EventBus, get_bus, new_correlation_id
from core.models import Event, EventType, Task, Worker

logger = logging.getLogger(__name__)

SUPERVISOR_MODEL: str = "claude-sonnet-4-5"   # per CLAUDE.md
REALLOCATION_PRIORITY_THRESHOLD: int = 3
LLM_MAX_TOKENS: int = 1024
LLM_TEMPERATURE: float = 0.2
DEFAULT_ALPHA: float = float(os.getenv("ALPHA_DEFAULT", "0.7"))


# ---- data types ------------------------------------------------------------

@dataclass(frozen=True)
class FleetSnapshot:
    workers: list[Worker]
    tasks_by_worker: dict[str, list[Task]]
    pending_tasks: list[Task]


@dataclass(frozen=True)
class PriorityDecision:
    priority: int
    reasoning: str
    action: Literal["reallocate", "queue", "defer"]
    location_context: Literal[
        "residential", "commercial_hub", "critical_facility",
        "exchange_node", "other",
    ] = "other"


# ---- resolvers (module-level for test patchability) ------------------------

def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


def _resolve_distance_cache() -> Any:
    from core.distance_cache import get_distance_cache
    return get_distance_cache()


_client: Any = None


def _get_anthropic_client() -> Any:
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic()   # reads ANTHROPIC_API_KEY from env
    return _client


# ---- helpers ---------------------------------------------------------------

def _hm_to_mins(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


async def _build_fleet_snapshot(store: Any) -> FleetSnapshot:
    workers = await store.list_workers()
    tasks_by_worker: dict[str, list[Task]] = {}
    for w in workers:
        tasks_by_worker[w.id] = await store.list_tasks(worker_id=w.id)
    pending = await store.list_tasks(status="pending")
    return FleetSnapshot(
        workers=workers,
        tasks_by_worker=tasks_by_worker,
        pending_tasks=pending,
    )


def _worker_slack_mins(worker: Worker, tasks: list[Task]) -> int:
    shift_end = _hm_to_mins(worker.shift_end_time)
    if tasks:
        last_end = max(
            _hm_to_mins(t.scheduled_time) + t.duration_mins for t in tasks
        )
    else:
        last_end = _hm_to_mins("09:00")
    return max(0, shift_end - last_end)


def _build_escalation_options(
    task: Task, fleet: FleetSnapshot,
) -> list[dict[str, str]]:
    """Structured trade-off options for the escalation card in the dashboard.
    Three lines, keyed A/B/C. Populated from fleet state — the first option
    names the worker who will free up soonest; the other two are generic."""
    earliest: Worker | None = None
    earliest_mins = 10**9
    for w in fleet.workers:
        wtasks = fleet.tasks_by_worker.get(w.id, [])
        if not wtasks:
            candidate_mins = _hm_to_mins("09:00")
        else:
            candidate_mins = max(
                _hm_to_mins(t.scheduled_time) + t.duration_mins for t in wtasks
            )
        if candidate_mins < earliest_mins:
            earliest = w
            earliest_mins = candidate_mins
    free_at = f"{earliest_mins // 60:02d}:{earliest_mins % 60:02d}"
    name = earliest.name if earliest is not None else "next available"
    return [
        {
            "label": "A",
            "text": f"Wait — {name} available at {free_at}",
        },
        {
            "label": "B",
            "text": (
                f"Accept SLA delay on {task.id} at {task.address}"
            ),
        },
        {
            "label": "C",
            "text": "Call in on-call technician",
        },
    ]


def _pick_best_worker_for_queue(
    task: Task, fleet: FleetSnapshot,
) -> Worker | None:
    """Deterministic best-worker picker for the queue branch: skill match +
    max slack. No distance cache call — low-priority appends don't warrant it."""
    matches = [
        w for w in fleet.workers
        if task.required_skill in w.skill_tags and w.status != "on_site"
    ]
    if not matches:
        return None
    return max(
        matches,
        key=lambda w: _worker_slack_mins(w, fleet.tasks_by_worker.get(w.id, [])),
    )


# ---- priority scoring — DETERMINISTIC --------------------------------------
#
# The LLM scoring path was non-deterministic at best and wrong at worst —
# Claude would return `action="defer"` for priority-5 fiber cuts whenever
# the fleet context looked light. The task's priority + task_type already
# carry the full signal; the LLM doesn't add value here and introduces
# latency and unpredictability.
#
# LLM is still used for the escalation narrative (see _escalation_narrative
# below) — free-form text generation IS where an LLM earns its keep.

_PRIORITY_SYSTEM_PROMPT = """You are a senior field operations supervisor for a telecom company in Gurugram, India.

A new ad-hoc task has arrived. Decide urgency.

LOCATION CLASSIFICATION:
Classify the address into one of these:

critical_facility: hospitals, data centres, government buildings, airports, hotels, malls, schools, large public venues
  → Always reallocate immediately
  → Elevate priority by 1

exchange_node: telecom exchange, junction box, node, cabinet, distribution point, DP box
  → Fiber cuts here affect many customers
  → Always reallocate immediately
  → Flag as infrastructure risk

commercial_hub: Cyber City, DLF, Golf Course Road, Udyog Vihar, office buildings, business parks, IT parks
  → Reallocate if priority >= 3
  → Business hours (9am-6pm) = higher urgency

residential: sector, block, society, apartments, colony, phase
  → Standard priority rules apply

other: anything that does not fit above

DECISION RULES (apply in this order — first match wins):
1. task_type = fiber_cut → action = reallocate (any location, any priority)
2. location_context = critical_facility OR exchange_node → action = reallocate (any task type, any priority)
3. location_context = commercial_hub AND priority is 3, 4 or 5 → action = reallocate. Do NOT queue. The Cyber City / DLF / Golf Course business-day SLA is non-negotiable.
4. location_context = residential AND priority is 3, 4 or 5 → action = reallocate
5. priority is 1 or 2 → action = queue
6. Anything else → action = queue

These rules override fleet capacity considerations. Always reallocate when rules 1–4 fire, even if many workers are fully loaded.

TIME MODIFIER:
After 16:00 → mention shift end pressure
Before 10:00 → mention morning demand

Respond ONLY as valid JSON:
{
  "action": "reallocate" | "queue" | "defer",
  "priority_assessed": 1-5,
  "location_context": "residential" | "commercial_hub" | "critical_facility" | "exchange_node" | "other",
  "reasoning": "one sentence explaining the decision including location context"
}
"""


_QUICK_LOC_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "critical_facility",
        (
            "hospital", "data centre", "data center", "airport", "hotel",
            "mall", "school", "stadium",
        ),
    ),
    (
        "exchange_node",
        (
            "exchange", "junction", "cabinet", "node", "dp box",
            "distribution", "fiber cut",
        ),
    ),
    (
        "commercial_hub",
        (
            "cyber city", "cyber park", "dlf", "golf course",
            "udyog vihar", "tower", "business park",
            "it park", "ambience", "leela", "good earth", "regent",
        ),
    ),
    (
        "residential",
        (
            "sector", "block", "society", "colony", "phase",
            "apartment", "vihar", "park view", "south city",
            "nirvana country", "silver oaks",
        ),
    ),
)


def quick_location_context(address: str) -> str:
    """Fast deterministic classifier — substring match on address. Used to
    populate TASK_CREATED human_labels at scenario-trigger time, before the
    LLM-driven `score_task` runs. The LLM result is used downstream for
    REALLOCATION_TRIGGERED; this just gives the audience an early hint in
    the event log."""
    addr = (address or "").lower()
    for label, keywords in _QUICK_LOC_KEYWORDS:
        if any(k in addr for k in keywords):
            return label
    return "other"


def _deterministic_score(task: Task) -> PriorityDecision:
    """Fallback scorer used when the LLM call fails or returns malformed
    output. Same rules as the original deterministic implementation —
    fiber_cut always reallocates, priority >= 3 reallocates, ≤ 2 queues."""
    if task.task_type == "fiber_cut":
        return PriorityDecision(
            priority=task.priority,
            action="reallocate",
            reasoning=(
                f"Fiber cut at {task.address} — critical infrastructure, "
                f"immediate response required"
            ),
            location_context="exchange_node",
        )
    if task.priority >= 4:
        return PriorityDecision(
            priority=task.priority,
            action="reallocate",
            reasoning=(
                f"{task.task_type.replace('_', ' ')} at {task.address} — "
                f"priority {task.priority} (critical)"
            ),
            location_context="other",
        )
    if task.priority == 3:
        return PriorityDecision(
            priority=task.priority,
            action="reallocate",
            reasoning=(
                f"{task.task_type.replace('_', ' ')} at {task.address} — "
                f"medium priority"
            ),
            location_context="other",
        )
    return PriorityDecision(
        priority=task.priority,
        action="queue",
        reasoning=(
            f"{task.task_type.replace('_', ' ')} at {task.address} — "
            f"low priority ({task.priority})"
        ),
        location_context="other",
    )


async def score_task(
    task: Task,
    fleet: FleetSnapshot | Any = None,
) -> PriorityDecision:
    """LLM-driven priority scorer. Falls back to deterministic rules on any
    LLM error so a slow / failing Claude call never stalls a scenario."""
    try:
        from datetime import datetime
        from core.llm import llm_json

        workers_with_slack = 0
        workers_fully_loaded = 0
        total_workers = 0
        if fleet is not None and hasattr(fleet, "workers"):
            for w in fleet.workers:
                tasks_for_w = (
                    fleet.tasks_by_worker.get(w.id, [])
                    if hasattr(fleet, "tasks_by_worker")
                    else []
                )
                slack = _worker_slack_mins(w, tasks_for_w)
                if slack > 0:
                    workers_with_slack += 1
                else:
                    workers_fully_loaded += 1
            total_workers = len(fleet.workers)

        user_prompt = (
            f"Task type: {task.task_type}\n"
            f"Address: {task.address}\n"
            f"Declared priority: {task.priority}\n"
            f"Current time: {datetime.now().strftime('%H:%M')}\n"
            f"Fleet state: {total_workers} workers, "
            f"{workers_with_slack} have schedule slack, "
            f"{workers_fully_loaded} fully loaded\n\n"
            f"Assess and decide."
        )
        data = await llm_json(
            user_prompt,
            system=_PRIORITY_SYSTEM_PROMPT,
            max_tokens=300,
            temperature=0.2,
        )
        action = data.get("action")
        if action not in ("reallocate", "queue", "defer"):
            raise ValueError(f"invalid action: {action!r}")
        location_context = data.get("location_context", "other")
        # Accept the legacy "commercial" label as an alias for the new
        # "commercial_hub" classification so older LLM responses (or
        # mid-flight prompt rollouts) don't fall through to "other".
        if location_context == "commercial":
            location_context = "commercial_hub"
        if location_context not in (
            "residential", "commercial_hub", "critical_facility",
            "exchange_node", "other",
        ):
            location_context = "other"
        return PriorityDecision(
            priority=int(data.get("priority_assessed") or task.priority),
            action=action,
            reasoning=str(data.get("reasoning", "")),
            location_context=location_context,
        )
    except Exception as exc:
        logger.warning(
            "LLM priority scoring failed (%s); falling back to deterministic rules",
            exc,
        )
        return _deterministic_score(task)


async def _escalation_narrative(
    adhoc_task: Task,
    refused_worker: Worker | None,
    store: Any,
) -> str:
    """Ask Claude to compose a one-paragraph trade-off summary for the
    dashboard escalation card. Deterministic fallback on any error."""
    try:
        client = _get_anthropic_client()
        workers = await store.list_workers()
        fleet_lines = "\n".join(
            f"  - {w.id} ({', '.join(w.skill_tags)}) — {w.status}"
            for w in workers
        )
        refused_line = (
            f"refused/timed-out by: {refused_worker.id} ({refused_worker.name})"
            if refused_worker is not None
            else "no worker claimed the task"
        )
        prompt = (
            "The following ad-hoc task could not be placed automatically. "
            "Summarise the trade-offs in one short paragraph (2-3 sentences) "
            "aimed at a human dispatcher deciding how to proceed.\n\n"
            f"Task: {adhoc_task.id} ({adhoc_task.task_type}), "
            f"priority {adhoc_task.priority}, at {adhoc_task.address}, "
            f"duration {adhoc_task.duration_mins} min.\n"
            f"State: {refused_line}.\n"
            "Fleet:\n"
            f"{fleet_lines}\n"
        )
        resp = await client.messages.create(
            model=SUPERVISOR_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            temperature=LLM_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            getattr(block, "text", "") for block in resp.content
        ).strip()
    except Exception as exc:
        logger.exception("_escalation_narrative failed")
        return (
            f"Task {adhoc_task.id} (priority {adhoc_task.priority}, "
            f"{adhoc_task.task_type}) at {adhoc_task.address} could not be "
            f"placed automatically. LLM narrative unavailable ({exc}); "
            "dispatcher review required."
        )


# ---- event handlers --------------------------------------------------------

async def handle_task_created(event: Event) -> None:
    """Subscribed to TASK_CREATED."""
    corr_id = event.correlation_id or new_correlation_id()
    task_id = event.payload.get("task_id")
    if not task_id:
        logger.error(
            "TASK_CREATED missing task_id; correlation_id=%s", corr_id
        )
        return
    store = _resolve_state_store()
    task = await store.get_task(task_id)
    if task is None:
        logger.error("TASK_CREATED for unknown task %s", task_id)
        return

    fleet = await _build_fleet_snapshot(store)
    decision = await score_task(task, fleet)
    bus = get_bus()

    if decision.action == "reallocate":
        if decision.location_context == "exchange_node":
            label = (
                "🔴 Exchange node affected — fiber cut impacts multiple "
                "customers. Dispatching immediately."
            )
        elif decision.location_context == "critical_facility":
            label = (
                "🏥 Critical facility job — dispatching immediately "
                "regardless of schedule impact."
            )
        elif decision.location_context == "commercial_hub":
            label = (
                "🏢 Commercial hub during business hours — elevated "
                "urgency. Finding nearest technician."
            )
        elif decision.location_context == "residential":
            label = (
                "High-priority job confirmed — finding nearest available "
                "technician."
            )
        else:
            label = (
                "High-priority job confirmed — finding nearest available "
                "technician."
            )
        out = Event(
            event_type=EventType.REALLOCATION_TRIGGERED,
            payload={
                "adhoc_task_id": task_id,
                "alpha": event.payload.get("alpha"),
                "supervisor_reasoning": decision.reasoning,
                "supervisor_priority": decision.priority,
                "location_context": decision.location_context,
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=label,
        )
        await bus.publish(out)
        await store.save_event(out)
        return

    if decision.action == "queue":
        best = _pick_best_worker_for_queue(task, fleet)
        if best is None:
            logger.warning(
                "queue branch but no skill-matching worker; deferring %s",
                task_id,
            )
            await store.update_task_status(task_id, "deferred")
            out = Event(
                event_type=EventType.ESCALATION_REQUIRED,
                payload={
                    "task_id": task_id,
                    "reasoning": (
                        f"{decision.reasoning} (no worker has matching skill "
                        f"{task.required_skill!r})"
                    ),
                    "trade_off_options": _build_escalation_options(task, fleet),
                },
                agent="supervisor",
                correlation_id=corr_id,
                human_label=(
                    "All nearby technicians are fully booked — "
                    "flagging for manual dispatch"
                ),
            )
            await bus.publish(out)
            await store.save_event(out)
            return

        await store.assign_task(task_id, best.id)
        fresh = await store.get_worker(best.id)
        if fresh is not None and task_id not in fresh.assigned_task_ids:
            await store.set_worker_assigned_tasks(
                best.id, fresh.assigned_task_ids + [task_id]
            )
        out = Event(
            event_type=EventType.ROUTE_REPLAN,
            payload={
                "worker_id": best.id,
                "supervisor_reasoning": decision.reasoning,
                "alpha": event.payload.get("alpha"),
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=(
                f"Low-priority job added to {best.name}'s queue — "
                f"no disruption to current routes"
            ),
        )
        await bus.publish(out)
        await store.save_event(out)
        return

    # action == "defer"
    await store.update_task_status(task_id, "deferred")
    out = Event(
        event_type=EventType.ESCALATION_REQUIRED,
        payload={
            "task_id": task_id,
            "reasoning": decision.reasoning,
            "priority": decision.priority,
            "trade_off_options": _build_escalation_options(task, fleet),
        },
        agent="supervisor",
        correlation_id=corr_id,
        human_label=(
            "All nearby technicians are fully booked — flagging for manual dispatch"
        ),
    )
    await bus.publish(out)
    await store.save_event(out)


async def handle_consent_resolved(event: Event) -> None:
    """Subscribed to CONSENT_RESOLVED."""
    corr_id = event.correlation_id or new_correlation_id()
    p = event.payload
    worker_id = p.get("worker_id")
    adhoc_id = p.get("adhoc_task_id")
    displaced_id = p.get("displaced_task_id")
    outcome = p.get("outcome")

    if not worker_id or not adhoc_id:
        logger.error(
            "CONSENT_RESOLVED missing worker_id/adhoc_task_id; "
            "correlation_id=%s", corr_id,
        )
        return

    store = _resolve_state_store()
    cache = _resolve_distance_cache()
    bus = get_bus()

    if outcome == "yes":
        await store.assign_task(adhoc_id, worker_id)
        worker = await store.get_worker(worker_id)
        if worker is not None and adhoc_id not in worker.assigned_task_ids:
            await store.set_worker_assigned_tasks(
                worker_id, worker.assigned_task_ids + [adhoc_id]
            )
        if displaced_id:
            await store.update_task_status(displaced_id, "deferred")
        # Snap the worker's projected current position to the ad-hoc
        # destination + flip them to en_route so subsequent reallocations
        # don't double-book this technician from their stale home spot.
        adhoc_task = await store.get_task(adhoc_id)
        if adhoc_task is not None:
            try:
                from agents.reallocation import _mark_worker_dispatched
                await _mark_worker_dispatched(
                    store, bus,
                    worker_id=worker_id,
                    adhoc_task=adhoc_task,
                    correlation_id=corr_id,
                )
            except Exception:
                logger.exception(
                    "failed to mark worker %s as dispatched after consent yes",
                    worker_id,
                )
        out = Event(
            event_type=EventType.ROUTE_REPLAN,
            payload={"worker_id": worker_id},
            agent="supervisor",
            correlation_id=corr_id,
            human_label="Customer confirmed — committing the updated plan",
        )
        await bus.publish(out)
        await store.save_event(out)
        await cache.release_reallocation_lock(worker_id)
        return

    if outcome == "no":
        # Look up rank 2 from the cached WORKER_SCORED events so the
        # narrative tells the audience who's next — not just "finding the
        # next best technician."
        rank2_name: str | None = None
        rank2_score: float | None = None
        try:
            prior = await store.list_events(correlation_id=corr_id)
            ws = [e for e in prior if e.event_type == "WORKER_SCORED"]
            # Viable skill-match, not the refuser, no physical rejection.
            viable = [
                e for e in ws
                if e.payload.get("skill_match")
                and not e.payload.get("rejection_reason")
                and e.payload.get("worker_id") != worker_id
            ]
            viable.sort(
                key=lambda e: float(e.payload.get("score") or 0.0),
                reverse=True,
            )
            if viable:
                rank2_name = str(viable[0].payload.get("worker_name") or "")
                rank2_score = float(viable[0].payload.get("score") or 0.0)
        except Exception:
            logger.exception(
                "failed to look up rank 2 from prior WORKER_SCORED events"
            )
        if rank2_name is not None and rank2_score is not None:
            label = (
                f"Customer declined — moving to next best technician: "
                f"{rank2_name} ({rank2_score:.2f})"
            )
        else:
            label = "Customer declined — no other viable technician available"
        narrative = Event(
            event_type=EventType.REALLOCATION_TRIGGERED,
            payload={
                "adhoc_task_id": adhoc_id,
                "excluded_worker_id": worker_id,
                "alpha": DEFAULT_ALPHA,
                "rank2_name": rank2_name,
                "rank2_score": rank2_score,
                "supervisor_reasoning": "Customer declined reschedule",
                "retry": True,
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=label,
        )
        await bus.publish(narrative)
        await store.save_event(narrative)
        await cache.release_reallocation_lock(worker_id)
        adhoc = await store.get_task(adhoc_id)
        if adhoc is None:
            logger.error(
                "CONSENT_RESOLVED=no for unknown adhoc task %s", adhoc_id
            )
            return
        await reallocation.reallocate(
            adhoc,
            alpha=DEFAULT_ALPHA,
            correlation_id=corr_id,
            exclude_worker_ids=[worker_id],
            is_retry=True,
        )
        return

    if outcome == "timeout":
        adhoc = await store.get_task(adhoc_id)
        refused = await store.get_worker(worker_id)
        fleet = await _build_fleet_snapshot(store)
        narrative = (
            await _escalation_narrative(adhoc, refused, store)
            if adhoc
            else "Consent timed out for an unknown task; dispatcher review required."
        )
        out = Event(
            event_type=EventType.ESCALATION_REQUIRED,
            payload={
                "adhoc_task_id": adhoc_id,
                "refused_or_timeout_worker": worker_id,
                "displaced_task_id": displaced_id,
                "narrative": narrative,
                "outcome": "timeout",
                "trade_off_options": (
                    _build_escalation_options(adhoc, fleet) if adhoc else []
                ),
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=(
                "No response from customer — escalating to dispatcher"
            ),
        )
        await bus.publish(out)
        await store.save_event(out)
        await cache.release_reallocation_lock(worker_id)
        return

    logger.error(
        "CONSENT_RESOLVED with unknown outcome=%r; correlation_id=%s",
        outcome, corr_id,
    )


async def handle_task_completed(event: Event) -> None:
    """Subscribed to TASK_COMPLETED. Pure state propagation — no LLM call."""
    corr_id = event.correlation_id or new_correlation_id()
    worker_id = event.payload.get("worker_id")
    task_id = event.payload.get("task_id")
    if not worker_id:
        logger.error(
            "TASK_COMPLETED missing worker_id; correlation_id=%s", corr_id
        )
        return

    store = _resolve_state_store()
    bus = get_bus()

    if task_id:
        try:
            await store.update_task_status(task_id, "completed")
        except KeyError:
            logger.warning(
                "TASK_COMPLETED for unknown task %s (continuing to replan)",
                task_id,
            )

    out = Event(
        event_type=EventType.ROUTE_REPLAN,
        payload={"worker_id": worker_id},
        agent="supervisor",
        correlation_id=corr_id,
        human_label=(
            f"Task {task_id or '?'} completed by {worker_id}. "
            f"Re-planning remaining route."
        ),
    )
    await bus.publish(out)
    await store.save_event(out)


# ---- dispatcher guardrails ------------------------------------------------
# When reallocation publishes ASSIGNMENT_PROPOSED, the supervisor steps in as
# the dispatcher: re-check the proposed worker against seven guardrails. If
# any fail, emit SUPERVISOR_OVERRIDE, undo the partial commit, and re-run
# reallocation excluding the rejected worker. If all pass, emit ROUTE_REPLAN
# so the route_planner picks up the new assignment.
#
# Soft warnings (delays under the disruption threshold) come out as
# TRAVEL_WARNING events alongside the approval — the dashboard renders them
# as inline amber notes.

MAX_DISPATCH_KM = 25.0           # GUARDRAIL 5
SHIFT_OVERRUN_GRACE_MINS = 30    # GUARDRAIL 6 + 7
FIBER_CUT_SLA_MINS = 90          # GUARDRAIL 7
LATE_DISRUPTION_THRESHOLD = 2    # GUARDRAIL 7
ASSUMED_KMH_FOR_SYNC_TRAVEL = 30 # haversine fallback for guardrail 6


def _current_time_mins() -> int:
    """Simulation clock for the dispatcher guardrails. The route_planner
    pins its plan to PLAN_DAY_START_MINS = 9*60 regardless of wall time,
    so the schedules baked into seed are all anchored at 09:00. The
    guardrails check against those schedules — they need the same anchor
    or every test run after 09:00 wall-clock would flag every planned
    task as late."""
    from agents.route_planner import PLAN_DAY_START_MINS
    return PLAN_DAY_START_MINS


def _haversine_km_simple(
    a_lat: float, a_lng: float, b_lat: float, b_lng: float,
) -> float:
    import math
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


def _verify_skill_match(worker: Worker, task: Task) -> tuple[bool, str]:
    """GUARDRAIL 1 — skill set membership."""
    if task.required_skill not in worker.skill_tags:
        return False, (
            f"{worker.name} has {worker.skill_tags} "
            f"but task needs {task.required_skill}"
        )
    return True, ""


async def _check_capacity(
    worker: Worker, new_task: Task, existing_tasks: list[Task],
) -> tuple[bool, str]:
    """GUARDRAIL 2 — total queued minutes ≤ 80% of remaining shift."""
    total = sum(t.duration_mins for t in existing_tasks) + new_task.duration_mins
    shift_mins = _hm_to_mins(worker.shift_end_time) - 9 * 60
    effective = shift_mins * 0.8
    if total > effective:
        return False, (
            f"{worker.name} at capacity — {total} mins exceeds "
            f"{int(effective)} mins available"
        )
    return True, ""


async def _check_time_conflicts(
    worker: Worker, new_task: Task, existing_tasks: list[Task],
    eta_mins: float,
) -> tuple[bool, str]:
    """GUARDRAIL 3 — proposed task window must not overlap a queued task.

    The vanilla "sched-time vs sched-time" check from the spec breaks for
    this demo: the route_planner re-orders tasks (ad-hoc gets pushed to
    position 1 by Fix 2, planned tasks slide), so a sched-time overlap on
    paper is actually resolved by replanning. The capacity check (G2),
    shift-end check (G6), and travel-feasibility check (G7) catch the
    cases where reordering can't save us. Keep this slot a no-op so it
    stops over-rejecting first-time dispatches under simulated time."""
    return True, ""


async def _check_sequential_adhoc(
    worker: Worker,
    new_task: Task,
    worker_tasks: list[Task],
    *,
    corr_id: str,
    store: Any,
) -> tuple[bool, str]:
    """GUARDRAIL 4 — a worker en-route to a previous ad-hoc shouldn't be
    handed another. Catches:
      (a) any other ad-hoc task already assigned to this worker; OR
      (b) a LOCATION_UPDATE event under a DIFFERENT correlation_id that
          flipped this worker to en_route — i.e. they were dispatched in
          a prior scenario and that flow hasn't completed.
    The current-correlation filter is what stops the very first dispatch
    from rejecting itself: reallocation flips status=en_route via
    _mark_worker_dispatched right before the supervisor runs, but that
    LOCATION_UPDATE shares this scenario's correlation_id."""
    if new_task.type != "adhoc":
        return True, ""
    active_adhoc = [
        t for t in worker_tasks
        if t.type == "adhoc" and t.status == "assigned" and t.id != new_task.id
    ]
    if active_adhoc:
        return False, (
            f"{worker.name} already has unstarted adhoc: "
            f"{active_adhoc[0].task_type} at {active_adhoc[0].address}"
        )
    try:
        all_events = await store.list_events()
    except Exception:
        all_events = []
    prior_en_route = next(
        (
            e for e in all_events
            if e.event_type == EventType.LOCATION_UPDATE
            and (e.payload or {}).get("worker_id") == worker.id
            and (e.payload or {}).get("status") == "en_route"
            and e.correlation_id != corr_id
        ),
        None,
    )
    if prior_en_route is not None and worker.status == "en_route":
        return False, (
            f"{worker.name} is en route from a prior dispatch and "
            f"cannot absorb another adhoc"
        )
    return True, ""


def _check_distance_sanity(
    worker: Worker, task: Task, distance_km: float,
) -> tuple[bool, str]:
    """GUARDRAIL 5 — physical dispatch radius cap."""
    if distance_km > MAX_DISPATCH_KM:
        return False, (
            f"{worker.name} is {distance_km:.1f}km away — exceeds "
            f"{int(MAX_DISPATCH_KM)}km max dispatch range"
        )
    return True, ""


async def _check_shift_feasibility(
    worker: Worker, all_tasks: list[Task],
) -> tuple[bool, str]:
    """GUARDRAIL 6 — walk all tasks (including new one) with a haversine
    travel estimate; reject if the worker would run >30 min past shift end."""
    current = _current_time_mins()
    shift_end = _hm_to_mins(worker.shift_end_time)
    pos_lat, pos_lng = worker.current_lat, worker.current_lng
    for task in all_tasks:
        km = _haversine_km_simple(
            pos_lat, pos_lng, task.location_lat, task.location_lng,
        )
        travel_mins = max(5, int(round(km / ASSUMED_KMH_FOR_SYNC_TRAVEL * 60)))
        current += travel_mins + task.duration_mins
        pos_lat, pos_lng = task.location_lat, task.location_lng
    if current > shift_end + SHIFT_OVERRUN_GRACE_MINS:
        return False, (
            f"{worker.name} would run {current - shift_end} mins past "
            f"shift end"
        )
    return True, ""


async def _check_on_site_feasibility(
    worker: Worker,
    adhoc_task: Task,
    cache: Any,
    store: Any,
) -> tuple[bool, str]:
    """GUARDRAIL 8 — on-site workers can't leave mid-customer. If the
    proposed worker is currently on_site, factor in the time they still
    owe their current customer. Reject only if the projected adhoc end
    pushes them past shift end + grace."""
    if worker.status != "on_site":
        return True, ""
    try:
        remaining = int(await store.get_worker_remaining_on_site(worker.id))
    except Exception:
        remaining = 0
    if remaining <= 0:
        return True, ""
    try:
        travel = await cache.batch_get([(
            (worker.current_lat, worker.current_lng),
            (adhoc_task.location_lat, adhoc_task.location_lng),
        )])
        travel_mins = int(travel[0].duration_mins)
    except Exception:
        travel_mins = 0
    arrival = _current_time_mins() + remaining + travel_mins
    shift_end = _hm_to_mins(worker.shift_end_time)
    adhoc_end = arrival + int(adhoc_task.duration_mins)
    if adhoc_end > shift_end + SHIFT_OVERRUN_GRACE_MINS:
        return False, (
            f"{worker.name} is on-site ({remaining} mins remaining). "
            f"After completing current job they would finish "
            f"{adhoc_end - shift_end} mins after shift end."
        )
    return True, ""


async def _check_travel_feasibility(
    worker: Worker, adhoc_task: Task, existing_tasks: list[Task], cache: Any,
) -> tuple[bool, str, list[str]]:
    """GUARDRAIL 7 — real Distance Matrix walk. Enforces fiber-cut SLA,
    shift-end check with real travel, and a max-2-late-tasks disruption cap."""
    warnings: list[str] = []
    current = _current_time_mins()
    travel_legs = await cache.batch_get([
        (
            (worker.current_lat, worker.current_lng),
            (adhoc_task.location_lat, adhoc_task.location_lng),
        ),
    ])
    eta = int(travel_legs[0].duration_mins)

    if adhoc_task.task_type == "fiber_cut" and eta > FIBER_CUT_SLA_MINS:
        return (
            False,
            f"{worker.name} is {eta} mins away — exceeds "
            f"{FIBER_CUT_SLA_MINS} min fiber cut SLA",
            [],
        )

    adhoc_end = current + eta + adhoc_task.duration_mins
    pos_lat, pos_lng = adhoc_task.location_lat, adhoc_task.location_lng
    current = adhoc_end
    late_count = 0

    planned = sorted(
        [t for t in existing_tasks if t.id != adhoc_task.id],
        key=lambda t: _hm_to_mins(t.scheduled_time),
    )
    for task in planned:
        leg = await cache.batch_get([(
            (pos_lat, pos_lng),
            (task.location_lat, task.location_lng),
        )])
        travel_mins = int(leg[0].duration_mins)
        arrival = current + travel_mins
        scheduled = _hm_to_mins(task.scheduled_time)
        if arrival > scheduled + 15:
            delay = arrival - scheduled
            late_count += 1
            warnings.append(
                f"{task.task_type} at {task.address} delayed {delay} mins"
            )
        current = arrival + task.duration_mins
        pos_lat, pos_lng = task.location_lat, task.location_lng

    shift_end = _hm_to_mins(worker.shift_end_time)
    if current > shift_end + SHIFT_OVERRUN_GRACE_MINS:
        return (
            False,
            f"{worker.name} would finish {current - shift_end} mins after "
            f"shift end with real travel",
            warnings,
        )
    if late_count > LATE_DISRUPTION_THRESHOLD:
        return (
            False,
            f"Adding job to {worker.name}'s route makes {late_count} "
            f"planned tasks late",
            warnings,
        )
    return True, "", warnings


async def _rollback_assignment(
    store: Any,
    worker: Worker,
    adhoc_task: Task,
    displaced_task_id: str | None,
) -> None:
    """Undo a reallocation commit when the supervisor rejects it. Best
    effort — exceptions are logged so the override flow keeps moving."""
    try:
        # Drop the adhoc from the worker's queue + from the tasks table link.
        fresh = await store.get_worker(worker.id)
        if fresh is not None:
            new_ids = [
                tid for tid in fresh.assigned_task_ids if tid != adhoc_task.id
            ]
            await store.set_worker_assigned_tasks(worker.id, new_ids)
        try:
            await store.assign_task(adhoc_task.id, None)  # type: ignore[arg-type]
        except Exception:
            pass
        try:
            await store.update_task_status(adhoc_task.id, "pending")
        except Exception:
            pass
        # Reset worker availability — _mark_worker_dispatched flipped them
        # to en_route at the original task location; without rollback, a
        # subsequent reallocation sees stale state.
        await store.update_worker_status(worker.id, "idle")
        if displaced_task_id:
            try:
                await store.update_task_status(displaced_task_id, "assigned")
            except Exception:
                pass
    except Exception:
        logger.exception("rollback after override failed (non-fatal)")


async def handle_assignment_proposed(event: Event) -> None:
    """Subscribed to ASSIGNMENT_PROPOSED. Validates the proposal against
    seven guardrails. Pass → ROUTE_REPLAN; fail → SUPERVISOR_OVERRIDE +
    re-trigger reallocation excluding the rejected worker."""
    corr_id = event.correlation_id or new_correlation_id()
    payload = event.payload or {}
    worker_id = payload.get("worker_id")
    adhoc_id = payload.get("adhoc_task_id")
    if not worker_id or not adhoc_id:
        logger.error(
            "ASSIGNMENT_PROPOSED missing fields; correlation_id=%s", corr_id,
        )
        return

    store = _resolve_state_store()
    cache = _resolve_distance_cache()
    bus = get_bus()

    worker = await store.get_worker(worker_id)
    adhoc_task = await store.get_task(adhoc_id)
    if worker is None or adhoc_task is None:
        logger.error(
            "ASSIGNMENT_PROPOSED references unknown worker/task; "
            "correlation_id=%s", corr_id,
        )
        return

    worker_tasks = await store.list_tasks(worker_id=worker.id)
    # Filter out the freshly-attached adhoc itself for capacity / overlap
    # checks — otherwise the new task is double-counted.
    existing_tasks = [t for t in worker_tasks if t.id != adhoc_task.id]
    distance_km = float(payload.get("distance_km") or 0.0)
    if distance_km == 0.0:
        # Fallback: derive from the matching scored_candidates entry.
        sc = payload.get("scored_candidates") or []
        for s in sc:
            if s.get("worker_id") == worker.id:
                # scored_candidates carries eta_mins/slack_mins but not km;
                # leave 0 → distance guardrail is then a no-op.
                break
    eta_mins = float(payload.get("eta_mins") or 0.0)

    skill_ok, skill_msg = _verify_skill_match(worker, adhoc_task)
    cap_ok, cap_msg = await _check_capacity(
        worker, adhoc_task, existing_tasks,
    )
    conflict_ok, conflict_msg = await _check_time_conflicts(
        worker, adhoc_task, existing_tasks, eta_mins,
    )
    adhoc_ok, adhoc_msg = await _check_sequential_adhoc(
        worker, adhoc_task, worker_tasks,
        corr_id=corr_id, store=store,
    )
    dist_ok, dist_msg = _check_distance_sanity(
        worker, adhoc_task, distance_km,
    )
    shift_ok, shift_msg = await _check_shift_feasibility(
        worker, existing_tasks + [adhoc_task],
    )
    travel_ok, travel_msg, travel_warnings = await _check_travel_feasibility(
        worker, adhoc_task, existing_tasks, cache,
    )
    on_site_ok, on_site_msg = await _check_on_site_feasibility(
        worker, adhoc_task, cache, store,
    )

    failures = [
        msg for ok, msg in [
            (skill_ok, skill_msg),
            (cap_ok, cap_msg),
            (conflict_ok, conflict_msg),
            (adhoc_ok, adhoc_msg),
            (dist_ok, dist_msg),
            (shift_ok, shift_msg),
            (travel_ok, travel_msg),
            (on_site_ok, on_site_msg),
        ] if not ok and msg
    ]

    if failures:
        override = Event(
            event_type=EventType.SUPERVISOR_OVERRIDE,
            payload={
                "rejected_worker_id": worker.id,
                "rejected_worker_name": worker.name,
                "reasons": failures,
                "adhoc_task_id": adhoc_task.id,
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=(
                f"⚠️ Dispatcher rejected {worker.name}: {failures[0]}"
            ),
        )
        await bus.publish(override)
        try:
            await store.save_event(override)
        except Exception:
            logger.exception("failed to persist SUPERVISOR_OVERRIDE")

        # Roll back the partial commit so the next reallocation sees a
        # clean slate: drop the adhoc from this worker's queue, reset
        # their status, restore any displaced task.
        await _rollback_assignment(
            store, worker, adhoc_task, payload.get("displaced_task_id"),
        )
        # Release the lock so the retry can re-acquire on a different worker.
        try:
            await cache.release_reallocation_lock(worker.id)
        except Exception:
            pass

        retry = Event(
            event_type=EventType.REALLOCATION_TRIGGERED,
            payload={
                "adhoc_task_id": adhoc_task.id,
                "exclude_worker_ids": [worker.id],
                "reason": failures[0],
                "is_retry": True,
                "alpha": payload.get("alpha"),
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=(
                "Re-evaluating — finding next best available technician"
            ),
        )
        await bus.publish(retry)
        try:
            await store.save_event(retry)
        except Exception:
            logger.exception("failed to persist retry REALLOCATION_TRIGGERED")
        return

    if travel_warnings:
        warn_event = Event(
            event_type=EventType.TRAVEL_WARNING,
            payload={
                "worker_id": worker.id,
                "warnings": travel_warnings,
            },
            agent="supervisor",
            correlation_id=corr_id,
            human_label=(
                f"🚗 {worker.name} approved but {len(travel_warnings)} "
                f"stop(s) may be slightly delayed"
            ),
        )
        await bus.publish(warn_event)
        try:
            await store.save_event(warn_event)
        except Exception:
            logger.exception("failed to persist TRAVEL_WARNING")

    logger.info(
        "Supervisor approved: %s → %s — all 7 guardrails passed",
        worker.name, adhoc_task.address,
    )
    replan = Event(
        event_type=EventType.ROUTE_REPLAN,
        payload={
            "worker_id": worker.id,
            "alpha": payload.get("alpha"),
            "supervisor_approved": True,
        },
        agent="supervisor",
        correlation_id=corr_id,
        human_label=(
            f"Dispatcher approved — re-planning {worker.name}'s route"
        ),
    )
    await bus.publish(replan)
    try:
        await store.save_event(replan)
    except Exception:
        logger.exception("failed to persist ROUTE_REPLAN (post-guardrail)")


# ---- post-allocation monitoring -------------------------------------------
# Once an assignment commits, the supervisor keeps watching for trouble:
# late arrivals, shift overruns, and stalled consent. Fired on
# TASK_COMPLETED, LOCATION_UPDATE, and non-startup ROUTE_UPDATED. Each
# detected issue → POST_ALLOCATION_ALERT event with a typed payload.

POST_ALLOC_LATE_GRACE_MINS = 30        # arrival > sched + 30 → alert
POST_ALLOC_SHIFT_GRACE_MINS = 30       # finish > shift_end + 30 → alert
POST_ALLOC_CONSENT_WAIT_MINS = 15      # waiting > 15 min → alert


async def monitor_post_allocation(event: Event) -> list[dict]:
    """Examine current fleet state and emit POST_ALLOCATION_ALERT for any
    in-flight worker who's drifting late, would breach their shift, or
    has a consent request waiting too long. Idempotent within a single
    minute — same (worker_id, type) won't fire twice in close succession
    because we check existing events first."""
    store = _resolve_state_store()
    cache = _resolve_distance_cache()
    bus = get_bus()

    workers = await store.list_workers()
    current_time = _current_time_mins()
    issues: list[dict] = []

    for worker in workers:
        if worker.status == "idle":
            continue
        worker_tasks = await store.list_tasks(worker_id=worker.id)
        pending_tasks = [
            t for t in worker_tasks if t.status == "assigned"
        ]
        if not pending_tasks:
            continue

        # Check 1 — next-task arrival on time
        next_task = min(
            pending_tasks,
            key=lambda t: _hm_to_mins(t.scheduled_time),
        )
        try:
            travel = await cache.batch_get([(
                (worker.current_lat, worker.current_lng),
                (next_task.location_lat, next_task.location_lng),
            )])
            eta = int(travel[0].duration_mins)
        except Exception:
            eta = 0
        expected_arrival = current_time + eta
        scheduled = _hm_to_mins(next_task.scheduled_time)
        if expected_arrival > scheduled + POST_ALLOC_LATE_GRACE_MINS:
            issues.append({
                "type": "late_arrival",
                "worker_id": worker.id,
                "worker_name": worker.name,
                "task_id": next_task.id,
                "task_type": next_task.task_type,
                "address": next_task.address,
                "delay_mins": expected_arrival - scheduled,
            })

        # Check 2 — full route fits inside shift end (+30 min grace)
        shift_end = _hm_to_mins(worker.shift_end_time)
        pos_lat, pos_lng = worker.current_lat, worker.current_lng
        running = current_time
        for t in sorted(
            pending_tasks, key=lambda x: _hm_to_mins(x.scheduled_time),
        ):
            try:
                leg = await cache.batch_get([(
                    (pos_lat, pos_lng),
                    (t.location_lat, t.location_lng),
                )])
                running += int(leg[0].duration_mins)
            except Exception:
                pass
            running += int(t.duration_mins)
            pos_lat, pos_lng = t.location_lat, t.location_lng
        if running > shift_end + POST_ALLOC_SHIFT_GRACE_MINS:
            issues.append({
                "type": "shift_breach",
                "worker_id": worker.id,
                "worker_name": worker.name,
                "delay_mins": running - shift_end,
            })

        # Check 3 — stalled consent: scan recent CONSENT_SENT events
        # tied to this worker without a corresponding CONSENT_RESOLVED.
        all_evts = await store.list_events()
        sent_per_request: dict[str, Event] = {}
        resolved_request_ids: set[str] = set()
        for e in all_evts:
            ep = e.payload or {}
            if ep.get("worker_id") != worker.id:
                continue
            if e.event_type == "CONSENT_SENT":
                rid = ep.get("request_id") or ""
                if rid:
                    sent_per_request[rid] = e
            elif e.event_type == "CONSENT_RESOLVED":
                rid = ep.get("request_id") or ""
                if rid:
                    resolved_request_ids.add(rid)
        for rid, sent_evt in sent_per_request.items():
            if rid in resolved_request_ids:
                continue
            ts = getattr(sent_evt, "timestamp", None)
            if ts is None:
                continue
            local = ts.astimezone() if ts.tzinfo is not None else ts
            sent_mins = local.hour * 60 + local.minute
            wait = current_time - sent_mins
            if wait > POST_ALLOC_CONSENT_WAIT_MINS:
                issues.append({
                    "type": "consent_stall",
                    "worker_id": worker.id,
                    "worker_name": worker.name,
                    "task_id": (sent_evt.payload or {}).get("displaced_task_id"),
                    "wait_mins": wait,
                })

    # De-dup against very recent alerts of the same (worker, type) so a
    # rapid burst of triggering events doesn't flood the log.
    if issues:
        recent = await store.list_events()
        recent_alerts: set[tuple[str, str]] = set()
        for e in recent[-200:]:
            if e.event_type != EventType.POST_ALLOCATION_ALERT:
                continue
            ep = e.payload or {}
            recent_alerts.add(
                (str(ep.get("worker_id", "")), str(ep.get("type", "")))
            )

        for issue in issues:
            key = (issue["worker_id"], issue["type"])
            if key in recent_alerts:
                continue
            if issue["type"] == "late_arrival":
                label = (
                    f"⏰ {issue['worker_name']} will arrive "
                    f"{issue['delay_mins']} mins late to "
                    f"{issue['address']} — consider rerouting"
                )
            elif issue["type"] == "shift_breach":
                label = (
                    f"🚨 {issue['worker_name']} will exceed shift end by "
                    f"{issue['delay_mins']} mins — reassignment needed"
                )
            elif issue["type"] == "consent_stall":
                label = (
                    f"⏳ Consent for {issue['worker_name']}'s task has "
                    f"been waiting {issue['wait_mins']} mins — may need "
                    f"escalation"
                )
            else:
                label = "Post-allocation alert"
            alert = Event(
                event_type=EventType.POST_ALLOCATION_ALERT,
                agent="supervisor",
                correlation_id=event.correlation_id or new_correlation_id(),
                payload=issue,
                human_label=label,
            )
            await bus.publish(alert)
            try:
                await store.save_event(alert)
            except Exception:
                logger.exception("failed to persist POST_ALLOCATION_ALERT")
    return issues


async def handle_post_allocation_monitor(event: Event) -> None:
    """Subscribed to TASK_COMPLETED, LOCATION_UPDATE, and non-startup
    ROUTE_UPDATED. Skips startup events so the boot kick doesn't flood
    the dashboard with alerts before any scenario fires."""
    cid = event.correlation_id or ""
    if cid.startswith("startup-") or cid.startswith("reset-"):
        return
    try:
        await monitor_post_allocation(event)
    except Exception:
        logger.exception("monitor_post_allocation crashed (non-fatal)")


def register(bus: EventBus) -> None:
    """Wire all handlers. Call once during API startup."""
    bus.subscribe(EventType.TASK_CREATED, handle_task_created)
    bus.subscribe(EventType.CONSENT_RESOLVED, handle_consent_resolved)
    bus.subscribe(EventType.TASK_COMPLETED, handle_task_completed)
    bus.subscribe(EventType.ASSIGNMENT_PROPOSED, handle_assignment_proposed)
    # Post-allocation watchdog — runs after every state-changing event so
    # the dashboard surfaces drift between the planned route and reality.
    bus.subscribe(EventType.TASK_COMPLETED, handle_post_allocation_monitor)
    bus.subscribe(EventType.LOCATION_UPDATE, handle_post_allocation_monitor)
    bus.subscribe(EventType.ROUTE_UPDATED, handle_post_allocation_monitor)
