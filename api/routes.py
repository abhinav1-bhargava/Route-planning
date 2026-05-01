"""REST endpoints — tasks / workers / routes / events / reset / scenarios.

Every mutation-emitting endpoint publishes the corresponding event to the
bus AND persists it via state_store, so the dashboard WebSocket sees the
same event the DB log records.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from core.event_bus import get_bus, new_correlation_id
from core.models import Event, EventType, Task, Worker
from core.state_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- request / response models ---------------------------------------------

class TaskCreateRequest(BaseModel):
    """Payload for POST /tasks. Server will assign an id if none provided."""
    id: Optional[str] = None
    type: str = "adhoc"
    task_type: str
    priority: int = Field(ge=1, le=5)
    location_lat: float
    location_lng: float
    address: str
    scheduled_time: str = "12:00"
    duration_mins: int = Field(gt=0, default=60)
    consent_required: bool = False
    required_skill: str
    alpha: Optional[float] = None


class TaskCreateResponse(BaseModel):
    task: Task
    correlation_id: str


class ScenarioTriggerResponse(BaseModel):
    scenario: int
    name: str
    expect: str
    correlation_id: str
    task_id: str


class ResetResponse(BaseModel):
    workers: int
    tasks: int


# ---- POST /tasks -----------------------------------------------------------

@router.post("/tasks", response_model=TaskCreateResponse)
async def create_task(req: TaskCreateRequest) -> TaskCreateResponse:
    store = get_store()
    bus = get_bus()

    task = Task(
        id=req.id or f"AD-API-{int(time.time() * 1000)}",
        type=req.type,  # type: ignore[arg-type]
        task_type=req.task_type,  # type: ignore[arg-type]
        priority=req.priority,
        location_lat=req.location_lat,
        location_lng=req.location_lng,
        address=req.address,
        scheduled_time=req.scheduled_time,
        duration_mins=req.duration_mins,
        consent_required=req.consent_required,
        status="pending",
        required_skill=req.required_skill,
        worker_id=None,
    )
    await store.upsert_task(task)

    from agents.supervisor import quick_location_context
    loc_ctx = quick_location_context(task.address)
    corr_id = new_correlation_id()
    ev = Event(
        event_type=EventType.TASK_CREATED,
        payload={
            "task_id": task.id,
            "alpha": req.alpha,
            "location_context": loc_ctx,
        },
        agent="api",
        correlation_id=corr_id,
        human_label=(
            f"New {task.task_type.replace('_', ' ')} reported at "
            f"{task.address} [{loc_ctx}] — reviewing fleet"
        ),
    )
    await bus.publish(ev)
    await store.save_event(ev)

    return TaskCreateResponse(task=task, correlation_id=corr_id)


# ---- GET /workers ----------------------------------------------------------

@router.get("/workers", response_model=list[Worker])
async def list_workers() -> list[Worker]:
    return await get_store().list_workers()


@router.get("/workers/{worker_id}/remaining")
async def worker_remaining(worker_id: str) -> dict:
    """How long until this worker can leave their current customer.
    Returns 0 unless the worker is on_site with an in-progress task."""
    store = get_store()
    worker = await store.get_worker(worker_id)
    if worker is None:
        raise HTTPException(
            status_code=404, detail=f"unknown worker {worker_id}",
        )
    remaining = await store.get_worker_remaining_on_site(worker_id)
    return {
        "worker_id": worker_id,
        "remaining_mins": int(remaining),
        "status": worker.status,
    }


@router.post("/workers/{worker_id}/arrive")
async def worker_arrive(worker_id: str) -> dict:
    """TEST_MODE-only: simulate the worker arriving on-site for their
    next assigned task. Flips status to on_site, marks the task
    in_progress so get_worker_remaining_on_site has something to count
    against, and emits LOCATION_UPDATE so timestamps are recoverable."""
    if not os.getenv("TEST_MODE"):
        raise HTTPException(status_code=403, detail="Test mode only")
    store = get_store()
    bus = get_bus()
    worker = await store.get_worker(worker_id)
    if worker is None:
        raise HTTPException(
            status_code=404, detail=f"unknown worker {worker_id}",
        )
    assigned = await store.list_tasks(
        worker_id=worker_id, status="assigned",
    )
    if not assigned:
        raise HTTPException(
            status_code=400,
            detail=f"{worker_id} has no assigned tasks to arrive on",
        )
    target = assigned[0]
    try:
        await store.update_task_status(target.id, "in_progress")
    except Exception:
        logger.exception("update_task_status failed (continuing)")
    await store.update_worker_status(worker_id, "on_site")
    try:
        await store.update_worker_location(
            worker_id, target.location_lat, target.location_lng,
        )
    except Exception:
        pass
    out = Event(
        event_type=EventType.LOCATION_UPDATE,
        payload={
            "worker_id": worker_id,
            "current_lat": target.location_lat,
            "current_lng": target.location_lng,
            "status": "on_site",
            "reason": "arrived",
            "task_id": target.id,
        },
        agent="simulation",
        correlation_id=f"arrive-{worker_id}-{int(time.time() * 1000)}",
        human_label=f"{worker.name} arrived on site at {target.address}",
    )
    await bus.publish(out)
    await store.save_event(out)
    return {
        "arrived": worker_id,
        "task_id": target.id,
        "duration_mins": target.duration_mins,
    }


# ---- GET /tasks ------------------------------------------------------------

@router.get("/tasks", response_model=list[Task])
async def list_tasks() -> list[Task]:
    """Every task in the store, ordered by scheduled_time. Dashboard uses
    this once at mount for initial map pins and refetches on TASK_CREATED
    events so ad-hoc tasks show up."""
    return await get_store().list_tasks()


# ---- GET /routes -----------------------------------------------------------

class RouteWithWorker(BaseModel):
    worker_id: str
    worker_name: str
    route: Any   # Route | None, serialised by pydantic


@router.get("/routes")
async def list_routes() -> list[dict]:
    """Latest route per worker, enriched with task addresses + per-stop ETAs
    so the dashboard can draw polylines and tooltips immediately on load
    (before any scenario fires)."""
    store = get_store()
    workers = await store.list_workers()
    # Pull the latest ROUTE_UPDATED per worker once for per-stop ETAs.
    all_events = await store.list_events()
    latest_route_updated: dict[str, Event] = {}
    for e in all_events:
        if e.event_type != "ROUTE_UPDATED":
            continue
        wid = e.payload.get("worker_id")
        if not wid:
            continue
        prev = latest_route_updated.get(wid)
        if prev is None or e.timestamp > prev.timestamp:
            latest_route_updated[wid] = e

    out: list[dict] = []
    for w in workers:
        r = await store.get_latest_route(w.id)
        task_ids = r.ordered_task_ids if r else []
        # Resolve task records for addresses.
        task_map: dict[str, Any] = {}
        for tid in task_ids:
            t = await store.get_task(tid)
            if t is not None:
                task_map[tid] = t

        route_evt = latest_route_updated.get(w.id)
        raw_stops = (
            route_evt.payload.get("per_stop_etas", []) if route_evt else []
        )
        stops_enriched = []
        for s in raw_stops:
            tid = s.get("task_id")
            t = task_map.get(tid)
            stops_enriched.append({
                "task_id": tid,
                "address": t.address if t else "",
                "arrival_time": s.get("arrival_time_hm", ""),
                "distance_km_so_far": s.get("distance_km_so_far", 0.0),
                "late": s.get("late", False),
            })
        # Estimated completion = last stop's arrival + that stop's
        # duration. Falls back to "" when there are no stops or no ETAs.
        estimated_completion = ""
        if stops_enriched and task_ids:
            last_stop = stops_enriched[-1]
            last_arr = (last_stop.get("arrival_time") or "").strip()
            last_tid = last_stop.get("task_id")
            last_task = task_map.get(last_tid) if last_tid else None
            if last_arr and ":" in last_arr and last_task is not None:
                try:
                    h, m = map(int, last_arr.split(":"))
                    total = h * 60 + m + int(last_task.duration_mins or 0)
                    estimated_completion = (
                        f"{total // 60:02d}:{total % 60:02d}"
                    )
                except Exception:
                    estimated_completion = ""

        out.append({
            "worker_id": w.id,
            "worker_name": w.name,
            "ordered_task_ids": task_ids,
            "ordered_task_addresses": [
                task_map[tid].address if tid in task_map else ""
                for tid in task_ids
            ],
            "total_distance_km": r.total_distance_km if r else 0.0,
            "total_time_mins": r.total_time_mins if r else 0,
            "version": r.version if r else 0,
            "per_stop_etas": stops_enriched,
            "estimated_completion": estimated_completion,
        })
    return out


# ---- GET /wfm-payload/{worker_id} ------------------------------------------

async def _build_wfm_payload(worker_id: str) -> Optional[dict]:
    """Assemble the full WFM dispatch payload for one worker from state_store
    + the event log. Returns None if the worker doesn't exist."""
    from datetime import datetime, timezone
    store = get_store()
    worker = await store.get_worker(worker_id)
    if worker is None:
        return None
    tasks = await store.list_tasks(worker_id=worker_id)
    route = await store.get_latest_route(worker_id)

    # Figure out the correlation_id driving this worker's latest state.
    all_events = await store.list_events()
    wevents = [
        e for e in all_events
        if e.payload.get("worker_id") == worker_id
        and not e.correlation_id.startswith("startup-")
    ]
    wevents.sort(key=lambda e: e.timestamp, reverse=True)
    latest_corr = wevents[0].correlation_id if wevents else (
        f"startup-{worker_id}"
    )
    corr_events = [e for e in all_events if e.correlation_id == latest_corr]

    # Per-stop ETAs from the latest ROUTE_UPDATED for this worker.
    per_stop = []
    for e in sorted(
        (e for e in all_events if e.event_type == "ROUTE_UPDATED"
         and e.payload.get("worker_id") == worker_id),
        key=lambda e: e.timestamp, reverse=True,
    ):
        per_stop = e.payload.get("per_stop_etas", [])
        break
    arrival_by_task = {
        s.get("task_id"): s.get("arrival_time_hm", "") for s in per_stop
    }

    # Decision metadata
    scored = [e for e in corr_events if e.event_type == "WORKER_SCORED"]
    alternatives = len(scored)
    my_score: Optional[float] = None
    for e in scored:
        if e.payload.get("worker_id") == worker_id:
            s = e.payload.get("score")
            if s is not None:
                my_score = float(s)
            break
    smart_assignment = any(
        e.event_type == "SMART_ASSIGNMENT" for e in corr_events
    )

    if corr_events:
        ts_list = [e.timestamp for e in corr_events]
        t_start = min(ts_list)
        t_end = max(ts_list)
        try:
            start_dt = (
                t_start if isinstance(t_start, datetime)
                else datetime.fromisoformat(str(t_start).replace("Z", "+00:00"))
            )
            end_dt = (
                t_end if isinstance(t_end, datetime)
                else datetime.fromisoformat(str(t_end).replace("Z", "+00:00"))
            )
            decision_time_ms = int(
                (end_dt - start_dt).total_seconds() * 1000
            )
        except Exception:
            decision_time_ms = 0
    else:
        decision_time_ms = 0

    trigger = ""
    for e in corr_events:
        if e.event_type == "TASK_CREATED":
            trigger = (
                str(e.payload.get("scenario_name"))
                if e.payload.get("scenario_name")
                else str(e.payload.get("task_id") or "")
            )
            break

    # Consent records
    consent_records: list[dict] = []
    for e in corr_events:
        if e.event_type == "CONSENT_SENT":
            consent_records.append({
                "task_id": e.payload.get("displaced_task_id"),
                "customer_contacted": True,
                "response": None,
                "response_time_mins": None,
            })
        elif e.event_type == "CONSENT_RESOLVED":
            if consent_records:
                consent_records[-1]["response"] = e.payload.get("outcome")
                consent_records[-1]["response_time_mins"] = (
                    e.payload.get("elapsed_mins")
                )

    # Displaced tasks — any task the worker previously had whose scheduled
    # slot moved because of this flow.
    displaced_tasks: list[dict] = []
    for e in corr_events:
        if (
            e.event_type == "CONSENT_RESOLVED"
            and e.payload.get("outcome") == "yes"
        ):
            did = e.payload.get("displaced_task_id")
            if did:
                disp = await store.get_task(did)
                displaced_tasks.append({
                    "task_id": did,
                    "original_time": disp.scheduled_time if disp else "",
                    "new_time": "",
                    "consent_obtained": True,
                })

    # Build a {displaced_task_id → (original_time, new_time)} map from
    # CONSENT_REQUIRED + CONSENT_RESOLVED events under this correlation
    # id. Used below to flag rescheduled tasks in the assigned list.
    rescheduled_map: dict[str, tuple[str, str]] = {}
    consent_req_by_displaced: dict[str, dict] = {}
    for e in corr_events:
        if e.event_type == "CONSENT_REQUIRED":
            d = (e.payload or {}).get("displaced_task_id")
            if d:
                consent_req_by_displaced[d] = e.payload or {}
    for e in corr_events:
        if (
            e.event_type == "CONSENT_RESOLVED"
            and (e.payload or {}).get("outcome") == "yes"
        ):
            d = (e.payload or {}).get("displaced_task_id")
            if not d:
                continue
            req = consent_req_by_displaced.get(d, {})
            rescheduled_map[d] = (
                req.get("proposed_old_time", ""),
                req.get("proposed_new_time", ""),
            )

    # Build a {adhoc_task_id → dispatch_time HH:MM} map from any
    # TASK_CREATED events that introduced an ad-hoc task on this worker's
    # correlation. The customer-facing scheduled_time of an ad-hoc is the
    # moment the dispatcher pushed it, not the placeholder slot from
    # trigger_scenario.py — so the WFM stamps the ad-hoc with its
    # TASK_CREATED timestamp.
    dispatch_time_by_task: dict[str, str] = {}
    all_events = await store.list_events()
    for e in all_events:
        if e.event_type != "TASK_CREATED":
            continue
        ep = e.payload or {}
        tid = ep.get("task_id")
        if not tid:
            continue
        ts = getattr(e, "timestamp", None)
        if ts is None:
            continue
        local = ts.astimezone() if ts.tzinfo is not None else ts
        dispatch_time_by_task[tid] = (
            f"{local.hour:02d}:{local.minute:02d}"
        )

    # Assigned tasks. The displayed `scheduled_time` is the planner's
    # ACTUAL arrival time from per_stop_etas, NOT the original seed
    # scheduled_time. After an ad-hoc insertion the planner reorders the
    # whole route, so the seed times are misleading — what matters to a
    # dispatcher is when the technician will actually arrive.
    #   - Adhoc tasks also get a `dispatch_time` (when they were created)
    #     so the WFM can show "Dispatched at HH:MM" alongside arrival.
    #   - Tasks moved by a CONSENT yes get `rescheduled=true` +
    #     `original_time` for the strikethrough display.
    assigned = []
    for t in tasks:
        is_adhoc = t.type == "adhoc"
        # Default to per_stop arrival; fall back to seed scheduled_time
        # if no arrival data (task not in route, e.g. completed/deferred).
        arrival_label = arrival_by_task.get(t.id) or t.scheduled_time
        dispatch_time: str | None = None
        if is_adhoc:
            dispatch_time = dispatch_time_by_task.get(t.id)
        item: dict[str, Any] = {
            "task_id": t.id,
            "task_type": t.task_type,
            "address": t.address,
            "scheduled_time": arrival_label,
            "duration_mins": t.duration_mins,
            "status": t.status,
            "required_skill": t.required_skill,
            "consent_obtained": not t.consent_required,
            "adhoc": is_adhoc,
            "priority": t.priority,
        }
        if dispatch_time:
            item["dispatch_time"] = dispatch_time
        if t.id in rescheduled_map:
            orig, new = rescheduled_map[t.id]
            item["rescheduled"] = True
            item["original_time"] = orig or t.scheduled_time
            if new:
                item["scheduled_time"] = new
        assigned.append(item)

    # Order assigned tasks by the planner's ordered_task_ids (route
    # sequence) when available — that way ad-hocs forced to position 1
    # by route_planner.py's priority gate also appear first in the WFM
    # list. Tasks not in the route (e.g. completed/deferred) go after.
    if route and route.ordered_task_ids:
        order_index = {
            tid: i for i, tid in enumerate(route.ordered_task_ids)
        }
        assigned.sort(
            key=lambda x: order_index.get(x["task_id"], 10_000),
        )

    stops = []
    if route:
        for i, tid in enumerate(route.ordered_task_ids, start=1):
            t = next((x for x in tasks if x.id == tid), None)
            stops.append({
                "sequence": i,
                "task_id": tid,
                "address": t.address if t else "",
                "arrival_time": arrival_by_task.get(tid, ""),
                "departure_time": "",
            })

    # Estimated completion — last stop's arrival + that stop's duration
    # (matches the /routes endpoint formula). Falls back to arrival-only
    # if duration lookup fails.
    estimated_completion = ""
    if stops and route:
        last_arr = (stops[-1].get("arrival_time") or "").strip()
        last_tid = stops[-1].get("task_id")
        last_task = next((x for x in tasks if x.id == last_tid), None)
        if last_arr and ":" in last_arr and last_task is not None:
            try:
                h, m = map(int, last_arr.split(":"))
                total = h * 60 + m + int(last_task.duration_mins or 0)
                estimated_completion = (
                    f"{total // 60:02d}:{total % 60:02d}"
                )
            except Exception:
                estimated_completion = last_arr
    elif stops:
        estimated_completion = stops[-1].get("arrival_time", "")

    from data.seed import WORKERS as _SEED_WORKERS
    zone = next(
        (w["zone"] for w in _SEED_WORKERS if w["id"] == worker_id), ""
    )

    return {
        "event": "TASK_ASSIGNMENT_UPDATE",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "worker": {
            "id": worker.id,
            "name": worker.name,
            "zone": zone,
            "current_location": {
                "lat": worker.current_lat,
                "lng": worker.current_lng,
            },
        },
        "assigned_tasks": assigned,
        "route": {
            "total_distance_km": route.total_distance_km if route else 0.0,
            "total_time_mins": route.total_time_mins if route else 0,
            "estimated_completion": estimated_completion,
            "version": route.version if route else 0,
            "stops": stops,
        },
        "displaced_tasks": displaced_tasks,
        "consent_records": consent_records,
        "decision_metadata": {
            "correlation_id": latest_corr,
            "trigger": trigger,
            "reallocation_score": my_score,
            "alternatives_considered": alternatives,
            "decision_time_ms": decision_time_ms,
            "smart_assignment": smart_assignment,
        },
    }


@router.get("/wfm-payload/{worker_id}")
async def wfm_payload(worker_id: str) -> dict:
    payload = await _build_wfm_payload(worker_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"unknown worker {worker_id}")
    return payload


@router.get("/wfm-payload")
async def wfm_payload_all() -> list[dict]:
    """WFM payloads for every worker, for operator inspection."""
    store = get_store()
    workers = await store.list_workers()
    out = []
    for w in workers:
        payload = await _build_wfm_payload(w.id)
        if payload is not None:
            out.append(payload)
    return out


# ---- GET /events -----------------------------------------------------------

@router.get("/events", response_model=list[Event])
async def list_events(
    limit: int = Query(50, gt=0, le=500),
    correlation_id: Optional[str] = None,
) -> list[Event]:
    store = get_store()
    events = await store.list_events(correlation_id=correlation_id, limit=limit)
    # Return most-recent-last so the dashboard can append naturally.
    return events[-limit:]


# ---- POST /reset -----------------------------------------------------------

@router.post("/reset", response_model=ResetResponse)
async def reset_demo() -> ResetResponse:
    """Truncate every table, re-seed from data.seed, flush cache locks.

    Mirrors `make reset` / `scripts/reset_demo.py`. Bus subscriptions are
    left intact — this is a data reset, not an app restart."""
    from data.seed import (
        DEFAULT_DB_PATH,
        PRE_ASSIGNMENTS,
        TASKS as SEED_TASKS,
        WORKERS as SEED_WORKERS,
        apply as seed_apply,
        build_tasks,
        build_workers,
        compute_realistic_times_async,
        set_realistic_times,
    )

    store = get_store()
    await store.reset()

    # Precompute scheduled_times from a live Distance Matrix call before
    # building Task records. This keeps the seed in lock-step with what
    # the route_planner picks at startup, so the on-time metric reflects
    # reality rather than NN drift.
    times = await compute_realistic_times_async(
        PRE_ASSIGNMENTS, SEED_TASKS, SEED_WORKERS,
    )
    set_realistic_times(times)

    workers = build_workers()
    tasks = build_tasks()
    # seed_apply writes through its own short-lived sqlite3 connection,
    # so the live aiosqlite handle sees the new state on the next query.
    seed_apply(workers, tasks, Path(DEFAULT_DB_PATH))

    # Kick a fresh startup-style ROUTE_REPLAN per worker so the routes
    # table repopulates immediately. Without this, /reset leaves the
    # routes table empty (no plan_route fires until the next user action),
    # and the e2e tests that read /routes right after a reset see empty
    # ordered_task_ids.
    bus = get_bus()
    store = get_store()
    import asyncio
    ready = asyncio.Event()
    seen: set[str] = set()

    async def _count_reset_routes(event: Event) -> None:
        if event.event_type != EventType.ROUTE_UPDATED:
            return
        cid = event.correlation_id or ""
        if not cid.startswith("reset-"):
            return
        wid = (event.payload or {}).get("worker_id")
        if wid:
            seen.add(str(wid))
            if len(seen) >= len(workers):
                ready.set()

    bus.subscribe(EventType.ROUTE_UPDATED, _count_reset_routes)
    for w in workers:
        ev = Event(
            event_type=EventType.ROUTE_REPLAN,
            payload={"worker_id": w.id},
            agent="api",
            correlation_id=f"reset-{w.id}",
            human_label=f"Re-planning route for {w.name} after reset.",
        )
        await bus.publish(ev)
        await store.save_event(ev)
    try:
        await asyncio.wait_for(ready.wait(), timeout=20.0)
    except asyncio.TimeoutError:
        logger.warning(
            "/reset: replan timeout — %d/%d workers done after 20s",
            len(seen), len(workers),
        )

    return ResetResponse(workers=len(workers), tasks=len(tasks))


# ---- POST /scenario/{n} ----------------------------------------------------

@router.post("/scenario/{n}", response_model=ScenarioTriggerResponse)
async def trigger_scenario(n: int, alpha: Optional[float] = None) -> ScenarioTriggerResponse:
    """Fire the pre-configured ad-hoc task for scenario N (1..6).

    The scenario payload is persisted as a task, then TASK_CREATED is
    published with `correlation_id = "scenario-{n}-{epoch_ms}"` so
    concurrent scenario runs stay distinct."""
    from scripts.trigger_scenario import SCENARIOS

    if n not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"unknown scenario: {n}")
    scenario = SCENARIOS[n]
    # Stamp the ad-hoc task with the actual trigger time. The scenario
    # payload defaults scheduled_time to "00:00" so the WFM + event log
    # show the real dispatch moment instead of the import-time constant.
    from datetime import datetime
    now = datetime.now()
    payload = dict(scenario.payload)
    payload["scheduled_time"] = f"{now.hour:02d}:{now.minute:02d}"
    task = Task(**payload)

    store = get_store()
    bus = get_bus()
    await store.upsert_task(task)

    from agents.supervisor import quick_location_context
    loc_ctx = quick_location_context(task.address)
    corr_id = f"scenario-{n}-{int(time.time() * 1000)}"
    ev = Event(
        event_type=EventType.TASK_CREATED,
        payload={
            "task_id": task.id,
            "alpha": alpha,
            "scenario": n,
            "scenario_name": scenario.name,
            "location_context": loc_ctx,
        },
        agent="api",
        correlation_id=corr_id,
        human_label=(
            f"New {task.task_type.replace('_', ' ')} reported at "
            f"{task.address} [{loc_ctx}] — reviewing fleet"
        ),
    )
    await bus.publish(ev)
    await store.save_event(ev)

    return ScenarioTriggerResponse(
        scenario=n,
        name=scenario.name,
        expect=scenario.expect,
        correlation_id=corr_id,
        task_id=task.id,
    )


# ---- POST /test/consent/{outcome} ------------------------------------------
# TEST_MODE-only escape hatch. The Telegram round-trip can't be exercised
# from CI, so the e2e suite calls this to resolve the most recent pending
# consent without needing a real customer reply.

@router.post("/test/consent/{outcome}")
async def test_resolve_consent(outcome: str) -> dict:
    if not os.getenv("TEST_MODE"):
        raise HTTPException(status_code=403, detail="Test mode only")
    if outcome not in ("yes", "no", "timeout"):
        raise HTTPException(
            status_code=400,
            detail="outcome must be yes / no / timeout",
        )
    store = get_store()
    bus = get_bus()
    events = await store.list_events()
    consent_sent = next(
        (
            e for e in reversed(events)
            if e.event_type == "CONSENT_SENT"
        ),
        None,
    )
    if consent_sent is None:
        raise HTTPException(
            status_code=404, detail="No pending consent",
        )
    p = consent_sent.payload or {}
    request_id = p.get("request_id")
    worker_id = p.get("worker_id")
    adhoc_id = p.get("adhoc_task_id")
    displaced_id = p.get("displaced_task_id")
    corr_id = consent_sent.correlation_id
    if request_id:
        try:
            await store.update_consent_response(request_id, outcome)
        except Exception:
            logger.exception(
                "test/consent: update_consent_response failed (continuing)"
            )
    out = Event(
        event_type=EventType.CONSENT_RESOLVED,
        payload={
            "worker_id": worker_id,
            "adhoc_task_id": adhoc_id,
            "displaced_task_id": displaced_id,
            "outcome": outcome,
            "raw_reply": "(test_mode)",
            "elapsed_mins": 0.0,
            "request_id": request_id,
            "short_code": None,
        },
        agent="test",
        correlation_id=corr_id,
        human_label=f"Test: consent resolved as {outcome}",
    )
    await bus.publish(out)
    await store.save_event(out)
    return {"resolved": outcome, "correlation_id": corr_id}


# ---- POST /test/complete-task/{task_id} ------------------------------------
# TEST_MODE-only: simulate a worker finishing a task. Marks status=completed,
# emits TASK_COMPLETED so the supervisor's post-allocation monitor runs.

@router.post("/test/complete-task/{task_id}")
async def test_complete_task(task_id: str) -> dict:
    if not os.getenv("TEST_MODE"):
        raise HTTPException(status_code=403, detail="Test mode only")
    store = get_store()
    bus = get_bus()
    task = await store.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} not found")
    worker_id = task.worker_id
    if not worker_id:
        raise HTTPException(
            status_code=400,
            detail=f"task {task_id} has no worker assigned",
        )
    try:
        await store.update_task_status(task_id, "completed")
    except Exception:
        logger.exception("update_task_status failed (continuing)")
    corr_id = f"test-complete-{task_id}-{int(time.time() * 1000)}"
    out = Event(
        event_type=EventType.TASK_COMPLETED,
        payload={
            "worker_id": worker_id,
            "task_id": task_id,
            "task_type": task.task_type,
            "address": task.address,
        },
        agent="test",
        correlation_id=corr_id,
        human_label=f"Test: {worker_id} completed {task_id}",
    )
    await bus.publish(out)
    await store.save_event(out)
    return {"completed": task_id, "worker_id": worker_id, "correlation_id": corr_id}
