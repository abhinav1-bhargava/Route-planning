"""Route planner — deterministic nearest-neighbour with time-window guardrails.

Subscribes to ROUTE_REPLAN, emits ROUTE_UPDATED. Pure scoring logic lives in
`plan_route`; `handle_route_replan` is a thin wrapper that fetches state,
runs the plan, persists the result, and publishes the event.

All distance/duration data comes through `core.distance_cache`. Google is
never called from here directly — the cache is the only boundary.
"""

from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from core.event_bus import EventBus, get_bus
from core.models import Event, EventType, Route, Task, Worker

logger = logging.getLogger(__name__)

DEFAULT_ALPHA: float = float(os.getenv("ALPHA_DEFAULT", "0.7"))
TIME_WINDOW_GRACE_MINS: int = 15
# Worker leaves home at the day start; the first leg's travel time is then
# added on top. Using a fixed day-start (rather than min-of-scheduled-times)
# means a task scheduled at 09:00 with a 22-min commute is no longer
# auto-flagged "late" — its scheduled_time can absorb the travel offset.
PLAN_DAY_START_MINS: int = 9 * 60


# ---- resolvers (module-level so tests can monkey-patch) -------------------

def _resolve_distance_cache() -> Any:
    from core.distance_cache import get_distance_cache
    return get_distance_cache()


def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


async def _resolve_next_route_version(worker_id: str) -> int:
    store = _resolve_state_store()
    return await store.next_route_version(worker_id)


# ---- helpers ---------------------------------------------------------------

def _hm_to_mins(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _mins_to_hm(m: int) -> str:
    m = max(0, min(m, 23 * 60 + 59))
    hh, mm = divmod(m, 60)
    return f"{hh:02d}:{mm:02d}"


# ---- public planner -------------------------------------------------------

async def plan_route(
    worker: Worker,
    tasks: list[Task],
    *,
    alpha: float = DEFAULT_ALPHA,
) -> Route:
    """Build a route covering `tasks` for `worker` using greedy nearest
    neighbour with time-window guardrails. `alpha` ∈ [0, 1] trades time
    (1.0) against distance (0.0). Empty task list → empty Route."""
    route, _details = await _plan_route_detail(worker, tasks, alpha=alpha)
    return route


async def _plan_route_detail(
    worker: Worker,
    tasks: list[Task],
    *,
    alpha: float = DEFAULT_ALPHA,
) -> tuple[Route, dict]:
    """Same as plan_route but also returns per-stop ETAs and the
    time_windows_violated flag. Used by handle_route_replan; kept private
    so the public surface stays Route-only."""
    version = await _resolve_next_route_version(worker.id)
    created = datetime.now(timezone.utc)

    if not tasks:
        return (
            Route(
                id=str(uuid4()),
                worker_id=worker.id,
                ordered_task_ids=[],
                total_distance_km=0.0,
                total_time_mins=0,
                version=version,
                created_at=created,
            ),
            {"per_stop_etas": [], "time_windows_violated": False},
        )

    # points[0] = worker, points[1..N] = tasks[0..N-1]
    points: list[tuple[float, float]] = [(worker.current_lat, worker.current_lng)]
    points.extend((t.location_lat, t.location_lng) for t in tasks)

    pair_idx: dict[tuple[int, int], int] = {}
    pairs: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for i in range(len(points)):
        for j in range(len(points)):
            if i == j:
                continue
            pair_idx[(i, j)] = len(pairs)
            pairs.append((points[i], points[j]))

    cache = _resolve_distance_cache()
    dm = await cache.batch_get(pairs)

    def leg_time(i: int, j: int) -> int:
        if i == j:
            return 0
        return dm[pair_idx[(i, j)]].duration_mins

    def leg_dist(i: int, j: int) -> float:
        if i == j:
            return 0.0
        return dm[pair_idx[(i, j)]].distance_km

    def leg_cost(i: int, j: int) -> float:
        return alpha * leg_time(i, j) + (1.0 - alpha) * leg_dist(i, j)

    plan_start_mins = PLAN_DAY_START_MINS
    running_mins = plan_start_mins
    current_idx = 0
    order_ids: list[str] = []
    per_stop: list[dict[str, Any]] = []
    total_dist = 0.0
    total_time = 0
    violated = False

    def _commit(pick: int) -> None:
        """Append `pick` to the route, advancing running_mins / total_dist
        by its leg from current_idx. Mutates outer state."""
        nonlocal running_mins, current_idx, total_dist, total_time, violated
        t_pick = tasks[pick - 1]
        lt = leg_time(current_idx, pick)
        ld = leg_dist(current_idx, pick)
        running_mins += lt
        sched = _hm_to_mins(t_pick.scheduled_time)
        late_here = running_mins > sched + TIME_WINDOW_GRACE_MINS
        if late_here:
            violated = True
        total_dist += ld
        per_stop.append({
            "task_id": t_pick.id,
            "arrival_time_hm": _mins_to_hm(running_mins),
            "arrival_mins_from_start": running_mins - plan_start_mins,
            "distance_km_so_far": round(total_dist, 3),
            "late": late_here,
        })
        order_ids.append(t_pick.id)
        total_time += lt + t_pick.duration_mins
        running_mins += t_pick.duration_mins
        current_idx = pick

    # Force priority>=4 ad-hoc tasks to the front of the route, highest
    # priority first. The audience-visible promise of an ad-hoc fiber cut
    # is "you go now" — geographic NN can demote it behind a closer
    # planned stop, which contradicts the message. Planned tasks fall
    # through to the existing NN-by-cost loop below.
    urgent_idxs = [
        j for j in range(1, len(points))
        if tasks[j - 1].type == "adhoc" and tasks[j - 1].priority >= 4
    ]
    urgent_idxs.sort(key=lambda j: tasks[j - 1].priority, reverse=True)
    remaining = [j for j in range(1, len(points)) if j not in set(urgent_idxs)]
    for j in urgent_idxs:
        _commit(j)

    while remaining:
        # Pick next: prefer non-late, fall back to best-cost overall.
        best_in_window: int | None = None
        best_in_window_cost = math.inf
        best_any: int | None = None
        best_any_cost = math.inf
        for j in remaining:
            c = leg_cost(current_idx, j)
            prospective = running_mins + leg_time(current_idx, j)
            sched = _hm_to_mins(tasks[j - 1].scheduled_time)
            late = prospective > sched + TIME_WINDOW_GRACE_MINS
            if c < best_any_cost:
                best_any, best_any_cost = j, c
            if not late and c < best_in_window_cost:
                best_in_window, best_in_window_cost = j, c
        pick = best_in_window if best_in_window is not None else best_any
        assert pick is not None
        _commit(pick)
        remaining.remove(pick)

    route = Route(
        id=str(uuid4()),
        worker_id=worker.id,
        ordered_task_ids=order_ids,
        total_distance_km=round(total_dist, 3),
        total_time_mins=total_time,
        version=version,
        created_at=created,
    )
    return route, {
        "per_stop_etas": per_stop,
        "time_windows_violated": violated,
    }


# ---- event handler --------------------------------------------------------

def _human_label(worker_name: str, route: Route, details: dict) -> str:
    """Deterministic fallback used when the LLM commentary fails."""
    stops = len(route.ordered_task_ids)
    if stops == 0:
        return f"{worker_name}'s route updated — no stops assigned"
    end_time = "—"
    per_stop = details.get("per_stop_etas") or []
    if per_stop:
        last = per_stop[-1]
        end_time = last.get("arrival_time_hm", "—")
    if details["time_windows_violated"]:
        return (
            f"{worker_name}'s route has a timing conflict — flagged for review"
        )
    return (
        f"{worker_name}'s route updated — "
        f"{stops} stop{'s' if stops != 1 else ''}, "
        f"{route.total_distance_km:.1f} km, done by {end_time}"
    )


async def _llm_route_commentary(
    worker_name: str, route: Route, details: dict, shift_end: str,
    tasks: list[Task],
) -> str:
    """One-sentence LLM narration of the route's logic. Falls back to the
    deterministic _human_label on any error."""
    try:
        from core.llm import llm_text
        per_stop = details.get("per_stop_etas") or []
        addr_by_id = {t.id: t.address for t in tasks}
        stop_lines = "\n".join(
            f"  {i+1}. {s.get('arrival_time_hm','--:--')} · "
            f"{addr_by_id.get(s.get('task_id',''), s.get('task_id',''))}"
            for i, s in enumerate(per_stop)
        ) or "  (no stops)"
        prompt = (
            f"A field technician's daily route has been planned.\n\n"
            f"Technician: {worker_name}\n"
            f"Stops in order:\n{stop_lines}\n"
            f"Total: {route.total_distance_km:.1f} km, "
            f"{route.total_time_mins} minutes\n"
            f"Shift ends: {shift_end}\n\n"
            f"In one sentence, describe the routing logic and any notable "
            f"trade-offs. Write as a field ops manager would explain it. "
            f"No bullet points. Return only the sentence."
        )
        text = (await llm_text(
            prompt, max_tokens=150, temperature=0.35,
        )).strip().strip('"')
        return text or _human_label(worker_name, route, details)
    except Exception:
        logger.warning("LLM route commentary failed; using template")
        return _human_label(worker_name, route, details)


async def _llm_conflict_explanation(
    worker_name: str,
    conflicting_address: str,
    scheduled_time: str,
    arrival_time: str,
    delay_mins: int,
) -> str:
    """One-sentence LLM-suggested action for a ROUTE_CONFLICT card."""
    try:
        from core.llm import llm_text
        prompt = (
            f"A field technician's route has a timing conflict.\n\n"
            f"Technician: {worker_name}\n"
            f"Conflicting stop: {conflicting_address}\n"
            f"Scheduled time: {scheduled_time}\n"
            f"Estimated arrival: {arrival_time}\n"
            f"Delay: {delay_mins} minutes late\n\n"
            f"In one sentence, explain the conflict and suggest one "
            f"practical action. Write plainly. Return only the sentence."
        )
        return (await llm_text(
            prompt, max_tokens=150, temperature=0.35,
        )).strip().strip('"')
    except Exception:
        logger.warning("LLM conflict explanation failed")
        return (
            f"{worker_name} is {delay_mins} minutes late for "
            f"{conflicting_address} — consider notifying the customer "
            f"or re-sequencing earlier stops."
        )


async def handle_route_replan(event: Event) -> None:
    """Subscribed to ROUTE_REPLAN. Payload must contain `worker_id`;
    optional `task_ids` overrides state_store lookup; optional `alpha`
    overrides DEFAULT_ALPHA."""
    worker_id = event.payload.get("worker_id")
    if not worker_id:
        logger.error(
            "ROUTE_REPLAN missing worker_id; correlation_id=%s",
            event.correlation_id,
        )
        return

    store = _resolve_state_store()
    worker = await store.get_worker(worker_id)
    if worker is None:
        logger.error("ROUTE_REPLAN for unknown worker %s", worker_id)
        return

    task_ids = event.payload.get("task_ids")
    if task_ids is not None:
        fetched: list[Task] = []
        for tid in task_ids:
            t = await store.get_task(tid)
            if t is not None:
                fetched.append(t)
        tasks = fetched
    else:
        tasks = await store.list_tasks(worker_id=worker_id)

    alpha_raw = event.payload.get("alpha")
    alpha = DEFAULT_ALPHA if alpha_raw is None else float(alpha_raw)

    route, details = await _plan_route_detail(worker, tasks, alpha=alpha)
    await store.save_route(route)

    bus = get_bus()
    # LLM commentary on non-trivial routes (skip on startup to keep boot fast).
    is_startup = (event.correlation_id or "").startswith("startup-")
    if is_startup or len(route.ordered_task_ids) == 0:
        commentary = _human_label(worker.name, route, details)
    else:
        commentary = await _llm_route_commentary(
            worker.name, route, details, worker.shift_end_time, tasks,
        )

    out = Event(
        event_type=EventType.ROUTE_UPDATED,
        payload={
            "worker_id": worker_id,
            "route_id": route.id,
            "ordered_task_ids": route.ordered_task_ids,
            "total_distance_km": route.total_distance_km,
            "total_time_mins": route.total_time_mins,
            "version": route.version,
            "alpha": alpha,
            "per_stop_etas": details["per_stop_etas"],
            "time_windows_violated": details["time_windows_violated"],
        },
        agent="route_planner",
        correlation_id=event.correlation_id,
        human_label=commentary,
    )
    await bus.publish(out)
    await store.save_event(out)

    # ROUTE_CONFLICT — emit for non-startup runs that violated a window.
    if not is_startup and details.get("time_windows_violated"):
        per_stop = details.get("per_stop_etas") or []
        late_stop = next((s for s in per_stop if s.get("late")), None)
        if late_stop is not None:
            tid = late_stop.get("task_id")
            ttask = next((t for t in tasks if t.id == tid), None)
            sched = ttask.scheduled_time if ttask else "--:--"
            arr = late_stop.get("arrival_time_hm", "--:--")
            try:
                def _hm_to_mins(s: str) -> int:
                    h, m = s.split(":")
                    return int(h) * 60 + int(m)
                delay = max(0, _hm_to_mins(arr) - _hm_to_mins(sched))
            except Exception:
                delay = 0
            explanation = await _llm_conflict_explanation(
                worker.name,
                ttask.address if ttask else (tid or ""),
                sched, arr, delay,
            )
            conflict = Event(
                event_type=EventType.ROUTE_CONFLICT,
                payload={
                    "worker_id": worker_id,
                    "task_id": tid,
                    "scheduled_time": sched,
                    "arrival_time": arr,
                    "delay_mins": delay,
                },
                agent="route_planner",
                correlation_id=event.correlation_id,
                human_label=explanation,
            )
            await bus.publish(conflict)
            try:
                await store.save_event(conflict)
            except Exception:
                logger.exception("failed to persist ROUTE_CONFLICT")


def register(bus: EventBus) -> None:
    """Wire handle_route_replan to the ROUTE_REPLAN event type."""
    bus.subscribe(EventType.ROUTE_REPLAN, handle_route_replan)
