"""Reallocation agent — deterministic worker scoring + lock-protected commit.

Subscribes to REALLOCATION_TRIGGERED. For a newly-arrived high-priority
ad-hoc task, filters candidates, scores each, acquires the per-worker
reallocation Redis lock, and either commits the assignment (emitting
ASSIGNMENT_PROPOSED) or holds the lock while CONSENT_REQUIRED fires.

Scoring (per CLAUDE.md):

    score(W) = alpha * (1 / eta_mins)
            + (1 - alpha) * slack_mins / 60.0
            + deferability_bonus

    eta_mins           — drive time from W's position to the ad-hoc task,
                          via distance_cache (never haversine)
    slack_mins         — max(0, (shift_end - last_task_end) - adhoc_duration)
    deferability_bonus — 0.5 * max(0, adhoc.priority - displaced.priority)

Higher score = better candidate.

Lock TTL:
    - Non-consent branch: REALLOCATION_LOCK_TTL (30 s). Lock released
      immediately after commit.
    - Consent branch: CONSENT_LOCK_TTL_SECONDS (11 min). Covers the
      10-min consent timeout + 1 min grace. Lock stays held across the
      Telegram round-trip; supervisor releases it on CONSENT_RESOLVED.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Literal

from core.distance_cache import (
    Coord,
    FAR_KM,
    REALLOCATION_LOCK_TTL,
    prefilter_by_haversine,
)
from core.event_bus import EventBus, get_bus
from core.models import Event, EventType, Task, Worker
from data.seed import WORKERS as _SEED_WORKERS

# Zone lookup keyed by worker id — seed.py is the source of truth for the
# human-readable label of each worker's home area. Used in WORKER_SCORED
# human_labels.
_ZONE_BY_ID: dict[str, str] = {w["id"]: w["zone"] for w in _SEED_WORKERS}


def _zone(worker_id: str) -> str:
    return _ZONE_BY_ID.get(worker_id, "")

logger = logging.getLogger(__name__)

DEFAULT_ALPHA: float = float(os.getenv("ALPHA_DEFAULT", "0.7"))
DEFERABILITY_BONUS_PER_POINT: float = 0.5
CONSENT_LOCK_TTL_SECONDS: int = 11 * 60   # 10 min consent timeout + 1 min grace
EPSILON_ETA_MINS: float = 0.5             # avoid div-by-zero for tiny ETAs
SCORE_DIFF_THRESHOLD: float = 0.05        # "virtually tied" threshold for Smart Assignment


@dataclass(frozen=True)
class WorkerScore:
    worker_id: str
    eta_mins: float
    slack_mins: int
    deferability_bonus: float
    displaced_task_id: str | None
    score: float


@dataclass(frozen=True)
class ReallocationDecision:
    outcome: Literal["assigned", "awaiting_consent", "no_candidate"]
    chosen_worker_id: str | None
    displaced_task_id: str | None
    score: float | None
    scored_candidates: list[WorkerScore]
    lock_held: bool
    reason: str


# ---- resolvers (module-level so tests can monkey-patch) -------------------

def _resolve_distance_cache() -> Any:
    from core.distance_cache import get_distance_cache
    return get_distance_cache()


def _resolve_state_store() -> Any:
    from core.state_store import get_store
    return get_store()


# ---- helpers ---------------------------------------------------------------

async def _mark_worker_dispatched(
    store: Any,
    bus: Any,
    *,
    worker_id: str,
    adhoc_task: Task,
    correlation_id: str,
) -> None:
    """Persist that `worker_id` has just been dispatched to `adhoc_task`:
    snap their projected current position to the task location, flip
    status to en_route, and broadcast a LOCATION_UPDATE so the dashboard
    + downstream agents see the change. Best-effort — exceptions are
    logged but never block the calling assignment commit."""
    try:
        await store.update_worker_location(
            worker_id, adhoc_task.location_lat, adhoc_task.location_lng,
        )
        await store.update_worker_status(worker_id, "en_route")
        worker = await store.get_worker(worker_id)
        worker_name = worker.name if worker is not None else worker_id
        evt = Event(
            event_type=EventType.LOCATION_UPDATE,
            payload={
                "worker_id": worker_id,
                "current_lat": adhoc_task.location_lat,
                "current_lng": adhoc_task.location_lng,
                "status": "en_route",
                "reason": "dispatched",
                "adhoc_task_id": adhoc_task.id,
            },
            agent="reallocation",
            correlation_id=correlation_id,
            human_label=(
                f"📍 {worker_name} en route to {adhoc_task.address}"
            ),
        )
        await bus.publish(evt)
        await store.save_event(evt)
    except Exception:
        logger.exception(
            "failed to mark worker %s as dispatched (non-fatal)", worker_id,
        )


def _hm_to_mins(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _mins_to_hm(m: int) -> str:
    m = max(0, min(m, 23 * 60 + 59))
    hh, mm = divmod(m, 60)
    return f"{hh:02d}:{mm:02d}"


def _shift_hm(hm: str, add_mins: int) -> str:
    return _mins_to_hm(_hm_to_mins(hm) + add_mins)


def _compute_slack_mins(
    worker: Worker,
    worker_tasks: list[Task],
    adhoc_duration_mins: int,
) -> int:
    shift_end = _hm_to_mins(worker.shift_end_time)
    if worker_tasks:
        last_end = max(
            _hm_to_mins(t.scheduled_time) + t.duration_mins
            for t in worker_tasks
        )
    else:
        # No queued tasks — treat shift as starting at 09:00 for slack math.
        last_end = _hm_to_mins("09:00")
    return max(0, (shift_end - last_end) - adhoc_duration_mins)


def _pick_displacement(worker_tasks: list[Task]) -> Task | None:
    """Lowest-priority task in the worker's current queue. None if empty."""
    if not worker_tasks:
        return None
    return min(worker_tasks, key=lambda t: t.priority)


async def _emit_worker_scored(
    bus: Any,
    store: Any,
    *,
    worker: Worker,
    correlation_id: str,
    eta_mins: float,
    distance_km: float,
    slack_mins: int,
    remaining_shift_mins: int,
    kpi_ontime: float,
    kpi_priority_fit: float,
    kpi_distance: float,
    score: float,
    skill_match: bool,
    selected: bool,
    rejection_reason: str | None,
    required_skill: str,
    on_site: bool = False,
    on_site_remaining_mins: int = 0,
    adjusted_eta_mins: float | None = None,
) -> None:
    """Emit a WORKER_SCORED event with all three KPI components exposed so
    the dashboard can re-rank client-side when the α slider moves."""
    zone = _zone(worker.id)
    adj_eta_int = int(adjusted_eta_mins if adjusted_eta_mins is not None else eta_mins)
    avail_mins = (
        9 * 60 + on_site_remaining_mins  # day_start anchor + remaining
        if on_site else 0
    )
    avail_hm = (
        f"{avail_mins // 60:02d}:{avail_mins % 60:02d}" if on_site else ""
    )

    if selected and on_site:
        label = (
            f"⭐ {worker.name} ({zone}) — on-site, free at {avail_hm}. "
            f"Adjusted ETA: {adj_eta_int} mins. "
            f"Score: {score:.2f} — SELECTED"
        )
    elif selected:
        label = (
            f"⭐ {worker.name} ({zone}) — {int(eta_mins)} mins away, "
            f"{distance_km:.1f} km\n"
            f"On-time: {kpi_ontime:.0%} · "
            f"Schedule fit: {kpi_priority_fit:.0%} · "
            f"Distance score: {kpi_distance:.0%}\n"
            f"Combined score: {score:.2f} — SELECTED"
        )
    elif rejection_reason == "wrong_skill":
        label = (
            f"🔧 {worker.name} ({zone}) — Score: {score:.2f} "
            f"but missing required skill ({required_skill})"
        )
    elif rejection_reason == "fully_booked":
        label = (
            f"📅 {worker.name} ({zone}) — Score: {score:.2f} "
            f"but fully booked (0 mins free)"
        )
    elif rejection_reason == "cannot_complete" and on_site:
        label = (
            f"🔨 {worker.name} ({zone}) — on-site until {avail_hm}, "
            f"adjusted ETA {adj_eta_int} mins — outside SLA"
        )
    elif rejection_reason == "cannot_complete":
        label = (
            f"⏰ {worker.name} ({zone}) — {distance_km:.1f} km away, "
            f"would finish after shift end. "
            f"Score: {score:.2f} — cannot complete in time"
        )
    elif on_site:
        # Viable on-site worker, just not best.
        label = (
            f"🔨 {worker.name} ({zone}) — on-site, free at {avail_hm}. "
            f"Score: {score:.2f}"
        )
    else:
        # Viable, skill-matched, but not best.
        label = (
            f"✅ {worker.name} ({zone}) — {int(eta_mins)} mins, "
            f"{distance_km:.1f} km · Score: {score:.2f}"
        )
    payload: dict[str, Any] = {
        "worker_id": worker.id,
        "worker_name": worker.name,
        "zone": zone,
        "distance_km": distance_km,
        "eta_mins": eta_mins,
        "slack_mins": slack_mins,
        "remaining_shift_mins": remaining_shift_mins,
        "kpi_ontime": kpi_ontime,
        "kpi_priority_fit": kpi_priority_fit,
        "kpi_distance": kpi_distance,
        "score": score,
        "skill_match": skill_match,
        "selected": selected,
        "rejection_reason": rejection_reason,
        "on_site": on_site,
        "remaining_on_site_mins": on_site_remaining_mins,
        "adjusted_eta_mins": adj_eta_int,
        "effective_availability": avail_hm,
    }
    event = Event(
        event_type=EventType.WORKER_SCORED,
        payload=payload,
        agent="reallocation",
        correlation_id=correlation_id,
        human_label=label,
    )
    await bus.publish(event)
    try:
        await store.save_event(event)
    except Exception:
        logger.exception("failed to persist WORKER_SCORED (non-fatal)")


# ---- public reallocation --------------------------------------------------

async def reallocate(
    adhoc_task: Task,
    *,
    alpha: float = DEFAULT_ALPHA,
    correlation_id: str,
    exclude_worker_ids: list[str] | None = None,
    is_retry: bool = False,
) -> ReallocationDecision:
    """See module docstring for formula and branch logic.

    `exclude_worker_ids` is used by the supervisor's CONSENT_RESOLVED=no
    branch to re-run reallocation without the refusing worker.

    `is_retry` is an informational hint; the actual retry path is
    auto-detected by the presence of prior WORKER_SCORED events under the
    same correlation_id. When retry is detected, distance/ETA values are
    reused from those events and Google Distance Matrix is NOT called.
    """
    _ = is_retry  # accepted for caller compatibility; auto-detected below
    store = _resolve_state_store()
    cache = _resolve_distance_cache()
    bus = get_bus()

    all_workers = await store.list_workers()
    worker_by_id = {w.id: w for w in all_workers}
    excluded = set(exclude_worker_ids or [])

    # ---- Detect retry: if prior WORKER_SCORED events exist for this
    # correlation_id, we're re-entering the flow (typically after
    # CONSENT_RESOLVED=no). Reuse the cached ETAs/distances so Google
    # isn't called a second time for the same flow.
    prior_events = await store.list_events(correlation_id=correlation_id)
    prior_ws = [e for e in prior_events if e.event_type == "WORKER_SCORED"]
    is_retry = len(prior_ws) > 0

    # ---- Stage 0: announce fleet scan (fresh run only) ----
    if not is_retry:
        scan_event = Event(
            event_type=EventType.FLEET_SCAN,
            payload={
                "adhoc_task_id": adhoc_task.id,
                "task_type": adhoc_task.task_type,
                "address": adhoc_task.address,
                "required_skill": adhoc_task.required_skill,
                "total_workers": len(all_workers),
            },
            agent="reallocation",
            correlation_id=correlation_id,
            human_label=(
                f"🔍 Checking all {len(all_workers)} technicians — location, "
                f"availability and skills for a "
                f"{adhoc_task.task_type.replace('_', ' ')} at "
                f"{adhoc_task.address}"
            ),
        )
        await bus.publish(scan_event)
        try:
            await store.save_event(scan_event)
        except Exception:
            logger.exception("failed to persist FLEET_SCAN (non-fatal)")

    # ---- score ALL workers on all three KPIs ----
    # No pre-filter on skill — skill is a selection gate, not a scoring filter.
    # Excluded workers (from a prior consent-no round) are dropped here so
    # they don't reappear in the audience's table for this retry.
    scorable_workers = [w for w in all_workers if w.id not in excluded]

    adhoc_coord: Coord = (adhoc_task.location_lat, adhoc_task.location_lng)

    # --- Source the distance/ETA values: cache (retry) or Google (fresh) ---
    dm_by_worker: dict[str, tuple[float, float]] = {}  # worker_id -> (km, mins)
    if is_retry:
        # Reuse cached KPI values from the prior round's WORKER_SCORED events.
        # No Google call.
        for e in prior_ws:
            p = e.payload
            dm_by_worker[p["worker_id"]] = (
                float(p.get("distance_km") or 0.0),
                float(p.get("eta_mins") or 0.0),
            )
        logger.info(
            "reallocate retry: reusing %d cached WORKER_SCORED entries "
            "(no Google call)", len(dm_by_worker),
        )
    else:
        pairs = [
            ((w.current_lat, w.current_lng), adhoc_coord) for w in scorable_workers
        ]
        dm_results = await cache.batch_get(pairs)
        for w, dm in zip(scorable_workers, dm_results):
            dm_by_worker[w.id] = (float(dm.distance_km), float(dm.duration_mins))

    tasks_by_worker: dict[str, list[Task]] = {}
    displaced_by_worker: dict[str, Task | None] = {}
    on_site_remaining: dict[str, int] = {}
    for w in scorable_workers:
        tasks_by_worker[w.id] = await store.list_tasks(worker_id=w.id)
        displaced_by_worker[w.id] = _pick_displacement(tasks_by_worker[w.id])
        # Workers actively on-site can't leave mid-job. Pull the
        # remaining-on-site minutes so scoring can add it to their ETA.
        if w.status == "on_site":
            try:
                on_site_remaining[w.id] = int(
                    await store.get_worker_remaining_on_site(w.id)
                )
            except Exception:
                logger.exception(
                    "remaining-on-site lookup failed for %s", w.id,
                )
                on_site_remaining[w.id] = 0
        else:
            on_site_remaining[w.id] = 0

    # Compute all three KPIs + combined score for each worker.
    scored_rows: list[dict[str, Any]] = []
    for w in scorable_workers:
        dm_km, dm_mins = dm_by_worker.get(w.id, (0.0, 0.0))
        # Adapter: downstream code expects a tiny object with distance_km
        # and duration_mins fields (same shape as DistanceResult).
        dm_stub = type(
            "DMStub", (), {"distance_km": dm_km, "duration_mins": dm_mins}
        )()
        wtasks = tasks_by_worker[w.id]
        shift_end = _hm_to_mins(w.shift_end_time)
        if wtasks:
            last_end = max(
                _hm_to_mins(t.scheduled_time) + t.duration_mins for t in wtasks
            )
        else:
            last_end = _hm_to_mins("09:00")
        remaining = max(0, shift_end - last_end)
        slack = max(0, remaining - adhoc_task.duration_mins)
        raw_eta = max(EPSILON_ETA_MINS, float(dm_stub.duration_mins))
        # Adjust ETA for on-site workers: they can't depart until their
        # current customer's job is finished.
        on_site_left = on_site_remaining.get(w.id, 0)
        adjusted_eta = raw_eta + on_site_left

        # KPI 1 — on-time probability (time buffer). Use the adjusted
        # ETA so an on-site worker who's an hour from being free scores
        # lower than an idle worker the same physical distance away.
        if remaining > 0:
            kpi_ontime = max(0.0, min(1.0, 1.0 - adjusted_eta / remaining))
        else:
            kpi_ontime = 0.0
        # KPI 2 — schedule fit
        kpi_fit = min(1.0, slack / 60.0)
        # KPI 3 — distance proximity (unaffected by on-site time)
        kpi_dist = 1.0 / (1.0 + dm_stub.distance_km)

        score = (
            alpha * kpi_ontime
            + 0.5 * (1.0 - alpha) * kpi_fit
            + 0.5 * (1.0 - alpha) * kpi_dist
        )

        skill_match = adhoc_task.required_skill in w.skill_tags
        # Can complete before shift end? Adjusted ETA + adhoc duration
        # must fit in the worker's remaining shift minutes.
        can_complete = (
            remaining > 0
            and (adjusted_eta + adhoc_task.duration_mins) <= remaining
        )

        scored_rows.append({
            "worker": w,
            "dm": dm_stub,
            "eta": raw_eta,
            "adjusted_eta": adjusted_eta,
            "on_site_remaining": on_site_left,
            "slack": slack,
            "remaining": remaining,
            "kpi_ontime": kpi_ontime,
            "kpi_fit": kpi_fit,
            "kpi_dist": kpi_dist,
            "score": score,
            "skill_match": skill_match,
            "can_complete": can_complete,
            "on_site": w.status == "on_site",
            "displaced": displaced_by_worker[w.id],
        })

    # Sort by combined score desc for selection walk + emission order.
    scored_rows.sort(key=lambda r: r["score"], reverse=True)

    # Selection gate: walk sorted list, pick first skill-matched worker
    # whose schedule still fits the new task. On-site workers are NOT
    # auto-excluded — their adjusted_eta + can_complete already
    # incorporates the time they still owe their current customer, so a
    # plumber 10 min from finishing a NR job will outscore an idle
    # technician an hour away. They're only filtered if can_complete=False.
    chosen_row: dict[str, Any] | None = None
    displaced_task: Task | None = None
    chosen_worker: Worker | None = None
    for r in scored_rows:
        if not r["skill_match"]:
            continue
        if r["slack"] == 0:
            continue
        if not r["can_complete"]:
            continue
        # Skill-matched, has slack, can reach in time, idle.
        # Try to acquire lock — skip on contention.
        worker = r["worker"]
        displaced = r["displaced"]
        needs_consent = bool(displaced and displaced.consent_required)
        ttl = CONSENT_LOCK_TTL_SECONDS if needs_consent else REALLOCATION_LOCK_TTL
        acquired = await cache.acquire_reallocation_lock(worker.id, ttl=ttl)
        if acquired:
            chosen_row = r
            chosen_worker = worker
            displaced_task = displaced
            break
        logger.info(
            "reallocation lock contention for %s; trying next candidate",
            worker.id,
        )

    # ---- Smart Assignment: score proximity check ------------------------
    # 0.05 threshold is the cheap pre-filter — only invoke LLM judgment
    # when scores are close enough that the trade-off is interesting.
    # The LLM weighs urgency vs customer-disruption cost. Falls back to
    # the original "always swap if rank2 doesn't need consent" rule on
    # LLM error.
    smart_switched: dict[str, Any] | None = None
    if (
        chosen_row is not None
        and chosen_worker is not None
        and displaced_task is not None
        and displaced_task.consent_required
    ):
        rank1_id = chosen_worker.id
        rank2_row: dict[str, Any] | None = None
        for r in scored_rows:
            if r["worker"].id == rank1_id:
                continue
            if r["on_site"] or not r["skill_match"]:
                continue
            if r["slack"] == 0 or not r["can_complete"]:
                continue
            rank2_row = r
            break
        if rank2_row is not None:
            score_diff = chosen_row["score"] - rank2_row["score"]
            rank2_displaced = rank2_row["displaced"]
            rank2_needs_consent = bool(
                rank2_displaced and rank2_displaced.consent_required
            )
            # Ask the LLM whether the close-tie warrants the customer
            # disruption — but only when the score gap is small AND the
            # rank-2 alternative doesn't ALSO need consent (otherwise
            # there's no disruption-saving available either way).
            should_swap = False
            if score_diff < SCORE_DIFF_THRESHOLD and not rank2_needs_consent:
                should_swap = True   # default if LLM unavailable
                try:
                    from core.llm import llm_json
                    judgment = await llm_json(
                        f"Two technicians are virtually tied for a "
                        f"{adhoc_task.task_type.replace('_',' ')} job at "
                        f"{adhoc_task.address}:\n\n"
                        f"Rank 1: {chosen_worker.name}\n"
                        f"  Score: {chosen_row['score']:.2f}\n"
                        f"  Would require moving their customer's "
                        f"{displaced_task.task_type.replace('_',' ')} "
                        f"from {displaced_task.scheduled_time} to a later slot\n\n"
                        f"Rank 2: {rank2_row['worker'].name}\n"
                        f"  Score: {rank2_row['score']:.2f}\n"
                        f"  No customer disruption needed\n"
                        f"  Score difference: {score_diff:.3f}\n\n"
                        f"The task is {adhoc_task.task_type} with priority "
                        f"{adhoc_task.priority}.\n\n"
                        f"Should we assign rank 1 (better score, customer "
                        f"disruption) or rank 2 (minimal disruption, slightly "
                        f"lower score)? Consider the urgency of the task "
                        f"versus the cost of customer disruption.\n\n"
                        f"Respond as JSON: "
                        f'{{"decision": "rank1"|"rank2", '
                        f'"reasoning": "one sentence"}}',
                        max_tokens=200,
                        temperature=0.2,
                    )
                    if judgment.get("decision") == "rank1":
                        should_swap = False
                    elif judgment.get("decision") == "rank2":
                        should_swap = True
                except Exception:
                    logger.warning(
                        "LLM smart-assignment judgment failed; defaulting to swap"
                    )
            if should_swap:
                # Try to acquire lock on rank 2 first — if contention, stay with rank 1.
                rank2_acquired = await cache.acquire_reallocation_lock(
                    rank2_row["worker"].id, ttl=REALLOCATION_LOCK_TTL,
                )
                if rank2_acquired:
                    # Release the original rank 1 lock.
                    await cache.release_reallocation_lock(rank1_id)
                    smart = Event(
                        event_type=EventType.SMART_ASSIGNMENT,
                        payload={
                            "rank1_worker_id": rank1_id,
                            "rank1_name": chosen_worker.name,
                            "rank1_score": chosen_row["score"],
                            "rank2_worker_id": rank2_row["worker"].id,
                            "rank2_name": rank2_row["worker"].name,
                            "rank2_score": rank2_row["score"],
                            "score_diff": score_diff,
                        },
                        agent="reallocation",
                        correlation_id=correlation_id,
                        human_label=(
                            f"⚖️ Score difference too small to justify "
                            f"customer disruption "
                            f"({chosen_row['score']:.2f} vs "
                            f"{rank2_row['score']:.2f}) — assigning "
                            f"{rank2_row['worker'].name} directly"
                        ),
                    )
                    await bus.publish(smart)
                    try:
                        await store.save_event(smart)
                    except Exception:
                        logger.exception("failed to persist SMART_ASSIGNMENT")
                    # Swap in rank 2 as the final choice.
                    smart_switched = chosen_row  # for logging
                    chosen_row = rank2_row
                    chosen_worker = rank2_row["worker"]
                    displaced_task = rank2_displaced

    # Emit WORKER_SCORED for every scored worker (in rank order).
    viable_count = 0
    for r in scored_rows:
        worker = r["worker"]
        is_selected = chosen_row is not None and worker.id == chosen_row["worker"].id
        rejection: str | None = None
        if not is_selected:
            if not r["skill_match"]:
                rejection = "wrong_skill"
            elif r["slack"] == 0:
                rejection = "fully_booked"
            elif not r["can_complete"]:
                rejection = "cannot_complete"
            else:
                viable_count += 1  # skill-matched + can complete, just not best
        else:
            viable_count += 1
        await _emit_worker_scored(
            bus, store,
            worker=worker, correlation_id=correlation_id,
            eta_mins=r["eta"],
            distance_km=r["dm"].distance_km,
            slack_mins=r["slack"],
            remaining_shift_mins=r["remaining"],
            kpi_ontime=r["kpi_ontime"],
            kpi_priority_fit=r["kpi_fit"],
            kpi_distance=r["kpi_dist"],
            score=r["score"],
            skill_match=r["skill_match"],
            selected=is_selected,
            rejection_reason=rejection,
            required_skill=adhoc_task.required_skill,
            on_site=r["on_site"],
            on_site_remaining_mins=r.get("on_site_remaining", 0),
            adjusted_eta_mins=r.get("adjusted_eta"),
        )

    # Announce scoring completion.
    scoring_complete = Event(
        event_type=EventType.SCORING_COMPLETE,
        payload={
            "evaluated": len(scorable_workers),
            "viable": viable_count,
            "selected_worker_id": chosen_row["worker"].id if chosen_row else None,
            "selected_name": chosen_worker.name if chosen_worker else None,
            "selected_score": chosen_row["score"] if chosen_row else None,
        },
        agent="reallocation",
        correlation_id=correlation_id,
        human_label=(
            f"📊 {len(scorable_workers)} technicians checked · "
            f"{viable_count} viable · "
            f"{chosen_worker.name if chosen_worker else 'no candidate'} selected"
        ),
    )
    await bus.publish(scoring_complete)
    try:
        await store.save_event(scoring_complete)
    except Exception:
        logger.exception("failed to persist SCORING_COMPLETE (non-fatal)")

    if chosen_row is None or chosen_worker is None:
        # Nothing viable — escalate. Supervisor/dashboard render the card.
        fleet_snapshot_for_options = type("S", (), {
            "workers": scorable_workers,
            "tasks_by_worker": tasks_by_worker,
        })()
        esc = Event(
            event_type=EventType.ESCALATION_REQUIRED,
            payload={
                "adhoc_task_id": adhoc_task.id,
                "reasoning": (
                    f"No technician available within range for skill "
                    f"{adhoc_task.required_skill!r}"
                ),
                "trade_off_options": [
                    {"label": "A", "text": "Wait — no nearby technician available"},
                    {"label": "B", "text": f"Accept SLA delay on {adhoc_task.id} at {adhoc_task.address}"},
                    {"label": "C", "text": "Call in on-call technician"},
                ],
            },
            agent="reallocation",
            correlation_id=correlation_id,
            human_label=(
                "No technician available within range — escalating to dispatcher"
            ),
        )
        await bus.publish(esc)
        try:
            await store.save_event(esc)
        except Exception:
            logger.exception("failed to persist ESCALATION_REQUIRED (non-fatal)")
        return ReallocationDecision(
            outcome="no_candidate", chosen_worker_id=None,
            displaced_task_id=None, score=None, scored_candidates=[],
            lock_held=False,
            reason=(
                f"no eligible workers (skill, slack, or reach): "
                f"skill={adhoc_task.required_skill!r}"
            ),
        )

    # Shim for the rest of the commit/consent code that expects `chosen` +
    # `scores` names from the old implementation.
    chosen = WorkerScore(
        worker_id=chosen_worker.id,
        eta_mins=chosen_row["eta"],
        slack_mins=chosen_row["slack"],
        deferability_bonus=0.0,
        displaced_task_id=displaced_task.id if displaced_task else None,
        score=chosen_row["score"],
    )
    scores = [
        WorkerScore(
            worker_id=r["worker"].id, eta_mins=r["eta"], slack_mins=r["slack"],
            deferability_bonus=0.0,
            displaced_task_id=r["displaced"].id if r["displaced"] else None,
            score=r["score"],
        )
        for r in scored_rows
    ]
    # Aliases that downstream code (ASSIGNMENT_PROPOSED / CONSENT_REQUIRED)
    # expects. `candidates` must mirror the old list contract.
    candidates = [r["worker"] for r in scored_rows]

    # ---- branch: consent required on displaced task ----
    if displaced_task is not None and displaced_task.consent_required:
        payload = {
            "worker_id": chosen.worker_id,
            "adhoc_task_id": adhoc_task.id,
            "displaced_task_id": displaced_task.id,
            "displaced_address": displaced_task.address,
            "proposed_old_time": displaced_task.scheduled_time,
            "proposed_new_time": _shift_hm(
                displaced_task.scheduled_time,
                adhoc_task.duration_mins + 30,
            ),
            "score": chosen.score,
            "alpha": alpha,
        }
        consent_event = Event(
            event_type=EventType.CONSENT_REQUIRED,
            payload=payload, agent="reallocation",
            correlation_id=correlation_id,
            human_label=(
                f"{chosen_worker.name} is the best option — has a "
                f"{displaced_task.task_type.replace('_', ' ')} at "
                f"{displaced_task.scheduled_time} that may need to move. "
                f"Requesting customer approval."
            ),
        )
        await bus.publish(consent_event)
        try:
            await store.save_event(consent_event)
        except Exception:
            logger.exception("failed to persist CONSENT_REQUIRED (non-fatal)")
        return ReallocationDecision(
            outcome="awaiting_consent",
            chosen_worker_id=chosen.worker_id,
            displaced_task_id=displaced_task.id,
            score=chosen.score,
            scored_candidates=scores, lock_held=True,
            reason=(
                "displaced task requires consent; CONSENT_REQUIRED emitted, "
                "lock held until CONSENT_RESOLVED"
            ),
        )

    # ---- branch: no consent needed — commit, emit, release ----
    try:
        await store.assign_task(adhoc_task.id, chosen.worker_id)
        fresh = await store.get_worker(chosen.worker_id)
        if fresh is not None and adhoc_task.id not in fresh.assigned_task_ids:
            await store.set_worker_assigned_tasks(
                chosen.worker_id,
                fresh.assigned_task_ids + [adhoc_task.id],
            )
        if displaced_task is not None:
            await store.update_task_status(displaced_task.id, "deferred")

        # Snap the worker's projected current position to the ad-hoc
        # destination + flip them to en_route. Subsequent reallocations
        # will score this worker from the new spot, so a freshly-tasked
        # technician isn't double-booked from their stale home position.
        await _mark_worker_dispatched(
            store, bus,
            worker_id=chosen.worker_id,
            adhoc_task=adhoc_task,
            correlation_id=correlation_id,
        )

        payload = {
            "worker_id": chosen.worker_id,
            "adhoc_task_id": adhoc_task.id,
            "displaced_task_id": (
                displaced_task.id if displaced_task else None
            ),
            "score": chosen.score,
            "eta_mins": chosen.eta_mins,
            "slack_mins": chosen.slack_mins,
            "alpha": alpha,
            "scored_candidates": [
                {
                    "worker_id": s.worker_id, "score": s.score,
                    "eta_mins": s.eta_mins, "slack_mins": s.slack_mins,
                }
                for s in scores
            ],
        }
        # Source distance from the already-scored row (works for both fresh
        # and retry paths — `dm_results` is only populated on fresh runs).
        chosen_scored = next(
            (r for r in scored_rows if r["worker"].id == chosen.worker_id),
            None,
        )
        chosen_distance_km = (
            chosen_scored["dm"].distance_km if chosen_scored else 0.0
        )
        # Generate a one-sentence selection narrative via LLM. Falls back
        # to a template on any failure so we never block the assignment.
        narration: str | None = None
        try:
            from core.llm import llm_text
            rank2 = next(
                (
                    r for r in scored_rows
                    if r["worker"].id != chosen.worker_id
                    and r["skill_match"] and not r["on_site"]
                    and r["slack"] > 0 and r["can_complete"]
                ),
                None,
            )
            rank2_blob = (
                f"Next best option: {rank2['worker'].name}\n"
                f"  score: {rank2['score']:.2f}\n"
                f"  ETA: {int(rank2['eta'])} minutes"
                if rank2 is not None else "Next best option: none viable"
            )
            narration = (await llm_text(
                f"You are narrating a field operations decision for a "
                f"non-technical audience.\n\n"
                f"Task: {adhoc_task.task_type.replace('_', ' ')} at "
                f"{adhoc_task.address}\n"
                f"Selected technician: {chosen_worker.name} "
                f"({_zone(chosen_worker.id)})\n"
                f"Their score: {chosen.score:.2f}\n"
                f"ETA: {int(chosen.eta_mins)} minutes\n"
                f"Distance: {chosen_distance_km:.1f} km\n"
                f"Schedule slack: {chosen.slack_mins} minutes\n\n"
                f"{rank2_blob}\n\n"
                f"In one sentence, explain why {chosen_worker.name} was "
                f"chosen. Write as a field ops manager would explain it "
                f"verbally. No scores or numbers unless they are meaningful. "
                f"Return only the sentence, nothing else.",
                max_tokens=150,
                temperature=0.4,
            )).strip().strip('"')
        except Exception:
            logger.warning(
                "LLM selection narration failed; using template label"
            )
        assigned_event = Event(
            event_type=EventType.ASSIGNMENT_PROPOSED,
            payload=payload, agent="reallocation",
            correlation_id=correlation_id,
            human_label=narration or (
                f"{chosen_worker.name} selected — "
                f"{int(chosen.eta_mins)} mins away, "
                f"{chosen_distance_km:.1f} km, route updated"
            ),
        )
        await bus.publish(assigned_event)
        try:
            await store.save_event(assigned_event)
        except Exception:
            logger.exception("failed to persist ASSIGNMENT_PROPOSED (non-fatal)")
    finally:
        await cache.release_reallocation_lock(chosen.worker_id)

    return ReallocationDecision(
        outcome="assigned", chosen_worker_id=chosen.worker_id,
        displaced_task_id=displaced_task.id if displaced_task else None,
        score=chosen.score, scored_candidates=scores, lock_held=False,
        reason="committed; ASSIGNMENT_PROPOSED emitted; lock released",
    )


# ---- event handler --------------------------------------------------------

async def handle_reallocation_triggered(event: Event) -> None:
    """Subscribed to REALLOCATION_TRIGGERED."""
    adhoc_task_id = event.payload.get("adhoc_task_id")
    if not adhoc_task_id:
        logger.error(
            "REALLOCATION_TRIGGERED missing adhoc_task_id; correlation_id=%s",
            event.correlation_id,
        )
        return
    store = _resolve_state_store()
    adhoc_task = await store.get_task(adhoc_task_id)
    if adhoc_task is None:
        logger.error(
            "REALLOCATION_TRIGGERED for unknown task %s", adhoc_task_id,
        )
        return
    alpha_raw = event.payload.get("alpha")
    alpha = DEFAULT_ALPHA if alpha_raw is None else float(alpha_raw)
    excluded = event.payload.get("exclude_worker_ids") or []
    is_retry = bool(event.payload.get("is_retry"))
    decision = await reallocate(
        adhoc_task, alpha=alpha, correlation_id=event.correlation_id,
        exclude_worker_ids=list(excluded),
        is_retry=is_retry,
    )
    logger.info(
        "reallocation decision: outcome=%s chosen=%s reason=%s",
        decision.outcome, decision.chosen_worker_id, decision.reason,
    )


def register(bus: EventBus) -> None:
    """Wire handle_reallocation_triggered to REALLOCATION_TRIGGERED."""
    bus.subscribe(
        EventType.REALLOCATION_TRIGGERED, handle_reallocation_triggered,
    )
