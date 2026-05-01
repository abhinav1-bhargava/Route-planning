"""Base seed state — 10 Gurugram field workers + 25 planned tasks.

Usage:
    python3.11 -m data.seed              # preview only (default, safe)
    python3.11 -m data.seed --apply      # write to demo.db
    python3.11 -m data.seed --first-tasks 25

Preview mode prints the worker roster and the first N tasks so a human
can sanity-check the fleet layout before the data hits the database.
Every row is validated through the Pydantic models in core.models
before insertion.

Task distribution (Fiber Cut is always ad-hoc — never seeded):
    10 x new_installation   priority=3  consent=True   duration=120  (09:00-14:00)
     9 x fault_repair       priority=3  consent=True   duration=60   (09:00-16:00)
     6 x network_rehab      priority=2  consent=False  duration=30   (09:00-17:00)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import sqlite3
import sys
from pathlib import Path

from core.models import Task, Worker

logger = logging.getLogger(__name__)


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = REPO_ROOT / "demo.db"
SCHEMA_PATH = REPO_ROOT / "data" / "schema.sql"

# S6 anchor — where the ad-hoc fiber cut lands.
S6_ANCHOR_LAT = 28.4595
S6_ANCHOR_LNG = 77.0266

# Per-task-type defaults. Stored fields stay independent (they are set on
# each row below); these constants just document the contract the seed
# upholds so drift is obvious at review time.
#
# `gap_mins` = duration + nominal travel to next stop. Used by
# assign_realistic_times() to space sequential starts so a worker can
# actually finish one task and travel to the next before the next start.
# `last_start` ensures every task can finish by the latest 18:00 shift end
# (NI 120 min → 16:00, FR 60 min → 17:00, NR 30 min → 17:30).
# `window` upper bound is widened to match `last_start` so scheduling does
# not violate the seed-validation guardrail.
TYPE_RULES = {
    "new_installation": dict(priority=3, consent=True,  duration=120,
                             gap_mins=150, last_start="16:00",
                             window=("09:00", "16:00")),
    "fault_repair":     dict(priority=3, consent=True,  duration=60,
                             gap_mins=80,  last_start="17:00",
                             window=("09:00", "17:00")),
    "network_rehab":    dict(priority=2, consent=False, duration=30,
                             gap_mins=50,  last_start="17:30",
                             window=("09:00", "17:30")),
}

# Sort order when packing a worker's day: heaviest-first so long
# new_installations land in the morning (with the most slack) and short
# network_rehabs slot in last (smallest end-of-day risk).
TYPE_COMPLEXITY = {
    "new_installation": 0,
    "fault_repair":     1,
    "network_rehab":    2,
}

DAY_START_HM = "09:00"


# ---------------------------------------------------------------------------
# Worker roster
# ---------------------------------------------------------------------------
# NOTE on W5 and W6: these two are positioned for Scenario 6 ("Optimise
# weight toggle"). S6 fires an ad-hoc fiber-cut at the Sector 29 anchor
# (28.4595, 77.0266) and needs W5 and W6 at approximately equal *road*
# distance in distinctly different directions. W5 sits on Sohna Road
# (south-southeast of the anchor), W6 on MG Road (east-northeast). W6 has
# been iterated: the first nudge to 28.4810,77.0685 made W6 ~0.32 km further
# from the anchor than W5, so it was pulled back to 28.4800,77.0680 to
# restore straight-line parity (target: within 0.10 km of W5). Verify road
# ETA against live Distance Matrix during demo prep.
# W5 and W6 share identical skill tags (network + HVAC); otherwise the S6
# tie collapses on the skill filter before the alpha weight check.
WORKERS: list[dict] = [
    dict(id="W1",  name="Aarav Sharma",  zone="Cyber City",        lat=28.4955, lng=77.0890, skills=["installation", "fiber_cut"],    shift_end="18:00"),
    dict(id="W2",  name="Diya Gupta",    zone="Golf Course Road",  lat=28.4420, lng=77.1023, skills=["network_rehab", "fiber_cut"],   shift_end="18:00"),
    dict(id="W3",  name="Rohan Singh",   zone="Udyog Vihar",       lat=28.5010, lng=77.0850, skills=["installation", "fault"],        shift_end="18:00"),
    dict(id="W4",  name="Isha Patel",    zone="Palam Vihar",       lat=28.5070, lng=77.0400, skills=["installation", "fault"],        shift_end="18:00"),
    dict(id="W5",  name="Arjun Mehta",   zone="Sohna Road",        lat=28.4245, lng=77.0480, skills=["fiber_cut", "network_rehab"],   shift_end="18:30"),
    dict(id="W6",  name="Kavya Reddy",   zone="MG Road",           lat=28.4800, lng=77.0680, skills=["fiber_cut", "network_rehab"],   shift_end="18:30"),
    dict(id="W7",  name="Vikram Kumar",  zone="Sector 14",         lat=28.4640, lng=77.0386, skills=["fault", "installation"],        shift_end="18:00"),
    dict(id="W8",  name="Priya Nair",    zone="Sector 29",         lat=28.4595, lng=77.0266, skills=["installation", "network_rehab"], shift_end="18:00"),
    dict(id="W9",  name="Rahul Joshi",   zone="South City",        lat=28.4330, lng=77.0850, skills=["installation", "fiber_cut"],    shift_end="19:00"),
    dict(id="W10", name="Sneha Iyer",    zone="Manesar",           lat=28.3540, lng=76.9380, skills=["network_rehab", "fault"],       shift_end="19:00"),
]


# ---------------------------------------------------------------------------
# Planned task roster — 25 tasks, zero fiber_cut (adhoc-only)
# ---------------------------------------------------------------------------
# Scheduling windows per TYPE_RULES:
#   new_installation: 09:00-14:00 start  (2hr duration, finishes <=16:00)
#   fault_repair:     09:00-16:00 start  (1hr duration, finishes <=17:00)
#   network_rehab:    09:00-17:00 start  (30min duration, finishes <=17:30)

# Task's required_skill is derived from task_type — the four skills in the
# taxonomy share names with the four task_types:
#   new_installation → installation
#   fault_repair     → fault
#   network_rehab    → network_rehab
#   fiber_cut        → fiber_cut     (ad-hoc only, not seeded)

_NEW_INSTALLATIONS: list[dict] = [
    dict(id="T01", address="DLF Cyber Hub, Tower A, Cyber City",     lat=28.4949, lng=77.0889, time="09:00", skill="installation"),
    dict(id="T02", address="Good Earth Business Bay 2, Udyog Vihar", lat=28.5020, lng=77.0860, time="09:30", skill="installation"),
    dict(id="T03", address="Ambience Mall, NH-8, Gurugram",          lat=28.5047, lng=77.0966, time="10:00", skill="installation"),
    dict(id="T04", address="JMD Regent Square, MG Road",             lat=28.4780, lng=77.0675, time="10:30", skill="installation"),
    dict(id="T05", address="DLF Phase 5, Golf Course Road",          lat=28.4410, lng=77.1020, time="11:00", skill="installation"),
    dict(id="T06", address="Cyber City Building 10B",                lat=28.4950, lng=77.0895, time="11:30", skill="installation"),
    dict(id="T07", address="Manesar Industrial Area, Plot 34",       lat=28.3540, lng=76.9380, time="12:00", skill="installation"),
    dict(id="T08", address="South City 1, Gate 2",                   lat=28.4325, lng=77.0840, time="12:30", skill="installation"),
    dict(id="T09", address="Palam Vihar Block C",                    lat=28.5080, lng=77.0410, time="13:00", skill="installation"),
    dict(id="T10", address="Omaxe Gurgaon Mall, Sohna Road",         lat=28.4160, lng=77.0500, time="14:00", skill="installation"),
]

_FAULT_REPAIRS: list[dict] = [
    dict(id="T11", address="MG Road Metro Station, Gurugram",        lat=28.4790, lng=77.0813, time="09:15", skill="fault"),
    dict(id="T12", address="Sector 14 Main Market, Gurugram",        lat=28.4670, lng=77.0380, time="10:15", skill="fault"),
    dict(id="T13", address="Leisure Valley Park, Sector 29",         lat=28.4602, lng=77.0260, time="11:15", skill="fault"),
    dict(id="T14", address="South City 2, Sector 49",                lat=28.4280, lng=77.0650, time="12:15", skill="fault"),
    dict(id="T15", address="Silver Oaks, Golf Course Road",          lat=28.4430, lng=77.1005, time="13:15", skill="fault"),
    dict(id="T16", address="Unitech Cyber Park, Sector 39",          lat=28.4450, lng=77.0500, time="14:15", skill="fault"),
    dict(id="T17", address="Cross Point Mall, Sector 29",            lat=28.4615, lng=77.0270, time="15:15", skill="fault"),
    dict(id="T18", address="DLF Galleria, Phase 4",                  lat=28.4680, lng=77.0890, time="15:45", skill="fault"),
    dict(id="T19", address="Udyog Vihar Phase 3",                    lat=28.4990, lng=77.0830, time="16:00", skill="fault"),
]

_NETWORK_REHABS: list[dict] = [
    dict(id="T20", address="Park View Spa Next, Sohna Road",         lat=28.4080, lng=77.0460, time="09:45", skill="network_rehab"),
    dict(id="T21", address="Sector 14 Residential Block B",          lat=28.4635, lng=77.0390, time="11:45", skill="network_rehab"),
    dict(id="T22", address="Nirvana Country, Sector 50",             lat=28.4160, lng=77.0630, time="13:45", skill="network_rehab"),
    dict(id="T23", address="Cyber City Building 9A",                 lat=28.4960, lng=77.0885, time="15:30", skill="network_rehab"),
    dict(id="T24", address="Manesar Sector 2",                       lat=28.3560, lng=76.9400, time="16:30", skill="network_rehab"),
    dict(id="T25", address="Palam Vihar Block E",                    lat=28.5090, lng=77.0430, time="17:00", skill="network_rehab"),
]


def _tasks_for_type(rows: list[dict], task_type: str) -> list[dict]:
    rule = TYPE_RULES[task_type]
    return [
        dict(r, task_type=task_type,
             duration=rule["duration"], priority=rule["priority"],
             consent=rule["consent"])
        for r in rows
    ]


TASKS: list[dict] = (
    _tasks_for_type(_NEW_INSTALLATIONS, "new_installation")
    + _tasks_for_type(_FAULT_REPAIRS, "fault_repair")
    + _tasks_for_type(_NETWORK_REHABS, "network_rehab")
)


# ---------------------------------------------------------------------------
# Pre-assignment map — which tasks each worker owns at day-start.
#
# Per the user's eligibility spec:
#   W1  electrical,network   → NI + NR
#   W2  HVAC,network         → FR + NR
#   W3  electrical,security  → NI + FR
#   W4  plumbing,electrical  → NI + FR
#   W5  network,HVAC         → NR + FR
#   W6  network,HVAC         → NR + FR
#   W7  security,plumbing    → FR
#   W8  electrical,HVAC      → NI
#   W9  plumbing,network     → NI + FR
#   W10 HVAC,security        → NI
#
# 25 tasks split 2–3 per worker, skill-matched wherever possible. Two NR
# tasks (T24 elec, T25 security) land on W5 and W6 as "stretch" assignments
# — neither of those NR-eligible workers has elec or sec in their tags, but
# the reallocation agent never re-checks skill on already-assigned tasks,
# so this is safe for the initial seed.
# ---------------------------------------------------------------------------
PRE_ASSIGNMENTS: dict[str, list[str]] = {
    "W1":  ["T01", "T02"],
    "W2":  ["T20", "T21"],
    "W3":  ["T03", "T11", "T12"],
    "W4":  ["T04", "T13", "T14"],
    "W5":  ["T22", "T23"],
    "W6":  ["T24", "T25"],
    "W7":  ["T05", "T15", "T16"],
    "W8":  ["T06", "T07"],
    "W9":  ["T08", "T09", "T10"],
    "W10": ["T17", "T18", "T19"],
}

# Inverted lookup: task_id -> worker_id. Populated at module load.
_TASK_OWNER: dict[str, str] = {
    tid: wid for wid, tids in PRE_ASSIGNMENTS.items() for tid in tids
}


def build_workers() -> list[Worker]:
    return [
        Worker(
            id=w["id"],
            name=w["name"],
            current_lat=w["lat"],
            current_lng=w["lng"],
            status="idle",
            skill_tags=w["skills"],
            shift_end_time=w["shift_end"],
            assigned_task_ids=list(PRE_ASSIGNMENTS.get(w["id"], [])),
        )
        for w in WORKERS
    ]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _hm_to_mins(hm: str) -> int:
    h, m = map(int, hm.split(":"))
    return h * 60 + m


def _mins_to_hm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


_PLANNER_ALPHA = 0.7


def _haversine_nn_order(
    start: tuple[float, float],
    task_rows: list[dict],
) -> list[dict]:
    """Greedy nearest-neighbour using straight-line distance only. Used as
    a fallback when the Google-backed planner-order computation is not
    available (e.g. unit tests, no API key). Order may diverge from the
    actual planner under heavy traffic but is good enough for previews."""
    remaining = list(task_rows)
    cur_lat, cur_lng = start
    out: list[dict] = []
    while remaining:
        nxt = min(
            remaining,
            key=lambda t: _haversine_km(cur_lat, cur_lng, t["lat"], t["lng"]),
        )
        out.append(nxt)
        cur_lat, cur_lng = nxt["lat"], nxt["lng"]
        remaining.remove(nxt)
    return out


def _planner_nn_order_from_matrix(
    task_rows: list[dict],
    matrix: list[list[tuple[float, int]]],
    *,
    alpha: float = _PLANNER_ALPHA,
) -> list[dict]:
    """Replay the route_planner's greedy NN against a Google distance
    matrix. matrix[i][j] = (km, mins); index 0 is the worker home,
    indices 1..N map to task_rows in order. Returns task_rows reordered
    by what the planner would actually pick (alpha-weighted leg cost,
    in-window preference disabled for the seed since scheduled_times
    are what we are computing). Caller must pass a matrix indexed
    consistently with task_rows."""
    n = len(task_rows)
    remaining = list(range(1, n + 1))
    cur = 0
    out: list[dict] = []
    while remaining:
        best = min(
            remaining,
            key=lambda j: alpha * matrix[cur][j][1] + (1 - alpha) * matrix[cur][j][0],
        )
        out.append(task_rows[best - 1])
        cur = best
        remaining.remove(best)
    return out


async def _fetch_worker_matrix(
    worker_pos: tuple[float, float],
    task_rows: list[dict],
) -> list[list[tuple[float, int]]] | None:
    """Pull a (1 + n_tasks) × (1 + n_tasks) distance matrix via the shared
    DistanceCache (Redis-backed when available). Going through the cache
    means the route_planner's later runtime call hits the same numbers we
    used at seed time — no traffic-jitter drift between the seed order
    and the planner's runtime order. Returns None on any failure so the
    caller can fall back to haversine."""
    try:
        from core.distance_cache import get_distance_cache
        cache = get_distance_cache()
        await cache.start()  # idempotent; degrades gracefully without Redis

        positions = [worker_pos] + [(t["lat"], t["lng"]) for t in task_rows]
        n = len(positions)
        # Build every (i, j) pair (skipping self pairs); the planner builds
        # the same set, so populating these cache entries hits the planner.
        pairs: list[tuple[tuple[float, float], tuple[float, float]]] = []
        index_of: dict[tuple[int, int], int] = {}
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                index_of[(i, j)] = len(pairs)
                pairs.append((positions[i], positions[j]))
        results = await cache.batch_get(pairs)

        matrix: list[list[tuple[float, int]]] = [
            [(0.0, 0) for _ in range(n)] for _ in range(n)
        ]
        for (i, j), idx in index_of.items():
            r = results[idx]
            matrix[i][j] = (float(r.distance_km), int(r.duration_mins))
        return matrix
    except Exception as exc:
        logger.warning(
            "Distance matrix unavailable for seed precompute (%s); "
            "falling back to haversine ordering",
            exc,
        )
        return None


_PLANNER_GRACE_MINS = 15
# Floor between any two consecutive stops, including worker-home → first
# task. Even when Google reports a sub-15-min leg (or zero, for a worker
# co-located with a task), we hold the schedule open by 15 min so the
# customer-facing time has a small buffer and the planner's grace check
# stays comfortable.
MIN_TRAVEL_BUFFER_MINS = 15


def _travel_per_leg(
    matrix: list[list[tuple[float, int]]],
    from_idx: int,
    to_idx: int,
) -> tuple[int, int]:
    """Return (real_travel_mins, floored_travel_mins) for a leg.
    `floored` is what the schedule uses; `real` is what the planner will
    actually consume at runtime."""
    real = int(matrix[from_idx][to_idx][1])
    return real, max(MIN_TRAVEL_BUFFER_MINS, real)


async def compute_realistic_times_async(
    pre_assignments: dict[str, list[str]],
    task_rows: list[dict],
    worker_rows: list[dict],
) -> dict[str, str]:
    """Async version: pulls a Distance Matrix once per worker (via the
    shared distance cache), picks the route order with the same NN-by-cost
    rule the planner uses, then assigns each stop's scheduled_time using
    the actual leg travel for the previous hop — floored to
    MIN_TRAVEL_BUFFER_MINS so even co-located workers carry a small
    customer-facing buffer. Falls back to haversine NN with no
    distance-data when the cache/Google call fails."""
    by_id = {t["id"]: t for t in task_rows}
    workers_by_id = {w["id"]: w for w in worker_rows}
    out: dict[str, str] = {}
    day_start = _hm_to_mins(DAY_START_HM)

    for wid, tids in pre_assignments.items():
        worker = workers_by_id[wid]
        worker_tasks = [by_id[tid] for tid in tids]
        if not worker_tasks:
            continue
        matrix = await _fetch_worker_matrix(
            (worker["lat"], worker["lng"]), worker_tasks,
        )

        if matrix is None:
            # No matrix → fall back to MIN_TRAVEL_BUFFER along haversine NN.
            # We have no real leg times, so each gap is duration + buffer.
            ordered = _haversine_nn_order(
                (worker["lat"], worker["lng"]), worker_tasks,
            )
            prev_sched: int | None = None
            prev_duration = 0
            for t in ordered:
                rule = TYPE_RULES[t["task_type"]]
                if prev_sched is None:
                    sched = day_start + MIN_TRAVEL_BUFFER_MINS
                else:
                    sched = prev_sched + prev_duration + MIN_TRAVEL_BUFFER_MINS
                last_allowed = _hm_to_mins(rule["last_start"])
                if sched > last_allowed:
                    raise ValueError(
                        f"Worker {wid}: task {t['id']} ({t['task_type']}) "
                        f"computed start {_mins_to_hm(sched)} exceeds "
                        f"last-start cap {rule['last_start']}"
                    )
                out[t["id"]] = _mins_to_hm(sched)
                prev_sched = sched
                prev_duration = t["duration"]
            continue

        # Replay the planner's NN-by-cost order against the cache-populated
        # matrix. Index 0 = worker home; index i+1 maps to worker_tasks[i].
        n = len(worker_tasks)
        remaining = list(range(1, n + 1))
        cur_idx = 0
        order_indices: list[int] = []
        while remaining:
            best = min(
                remaining,
                key=lambda j: (
                    _PLANNER_ALPHA * matrix[cur_idx][j][1]
                    + (1 - _PLANNER_ALPHA) * matrix[cur_idx][j][0]
                ),
            )
            order_indices.append(best)
            cur_idx = best
            remaining.remove(best)

        # Walk the chosen order using the actual matrix leg times.
        # scheduled_time[k] = scheduled_time[k-1] + duration[k-1]
        #                   + max(15, real_travel_(k-1)→k)
        # First stop: scheduled_time[0] = day_start
        #                              + max(15, real_travel_home→first).
        prev_sched_val: int | None = None
        prev_duration = 0
        prev_matrix_idx = 0
        for picked in order_indices:
            t_row = worker_tasks[picked - 1]
            _real, leg = _travel_per_leg(matrix, prev_matrix_idx, picked)
            if prev_sched_val is None:
                sched = day_start + leg
            else:
                sched = prev_sched_val + prev_duration + leg

            rule = TYPE_RULES[t_row["task_type"]]
            last_allowed = _hm_to_mins(rule["last_start"])
            if sched > last_allowed:
                raise ValueError(
                    f"Worker {wid}: task {t_row['id']} "
                    f"({t_row['task_type']}) computed start "
                    f"{_mins_to_hm(sched)} exceeds last-start cap "
                    f"{rule['last_start']}"
                )
            out[t_row["id"]] = _mins_to_hm(sched)
            prev_sched_val = sched
            prev_duration = t_row["duration"]
            prev_matrix_idx = picked

    return out


def assign_realistic_times(
    pre_assignments: dict[str, list[str]],
    task_rows: list[dict],
    worker_rows: list[dict],
) -> dict[str, str]:
    """Sync entry point. Tries the Google-backed precompute via
    asyncio.run(); if no event loop is available *because we are already
    inside one* (e.g. called from the FastAPI reset handler), the caller
    should `await compute_realistic_times_async` directly instead.
    Falls back to haversine NN on any error."""
    try:
        return asyncio.run(
            compute_realistic_times_async(
                pre_assignments, task_rows, worker_rows,
            )
        )
    except RuntimeError as exc:
        # Likely "asyncio.run() cannot be called from a running event loop"
        logger.warning(
            "assign_realistic_times sync entry hit running event loop (%s); "
            "falling back to pure haversine NN",
            exc,
        )
    except Exception:
        logger.exception(
            "assign_realistic_times async path failed; falling back to "
            "haversine NN"
        )

    # Pure-haversine fallback path.
    by_id = {t["id"]: t for t in task_rows}
    workers_by_id = {w["id"]: w for w in worker_rows}
    out: dict[str, str] = {}
    day_start = _hm_to_mins(DAY_START_HM)
    for wid, tids in pre_assignments.items():
        worker = workers_by_id[wid]
        worker_tasks = [by_id[tid] for tid in tids]
        ordered = _haversine_nn_order(
            (worker["lat"], worker["lng"]), worker_tasks
        )
        cur = day_start
        for t in ordered:
            ttype = t["task_type"]
            rule = TYPE_RULES[ttype]
            last_allowed = _hm_to_mins(rule["last_start"])
            if cur > last_allowed:
                raise ValueError(
                    f"Worker {wid}: task {t['id']} ({ttype}) computed start "
                    f"{_mins_to_hm(cur)} exceeds last-start cap "
                    f"{rule['last_start']}"
                )
            out[t["id"]] = _mins_to_hm(cur)
            cur += rule["gap_mins"]
    return out


# Lazy realistic-times cache — populated on first build_tasks() call so
# `import data.seed` itself remains side-effect-free (no Google calls at
# import time). Set explicitly via set_realistic_times() from async
# callers (e.g. the FastAPI /reset handler).
_REALISTIC_TIMES: dict[str, str] | None = None


def set_realistic_times(times: dict[str, str]) -> None:
    """Override the lazy cache — used by async callers that want to
    precompute via compute_realistic_times_async() before invoking the
    sync build_tasks()."""
    global _REALISTIC_TIMES
    _REALISTIC_TIMES = dict(times)


def _ensure_realistic_times() -> dict[str, str]:
    global _REALISTIC_TIMES
    if _REALISTIC_TIMES is None:
        _REALISTIC_TIMES = assign_realistic_times(
            PRE_ASSIGNMENTS, TASKS, WORKERS,
        )
    return _REALISTIC_TIMES


def build_tasks() -> list[Task]:
    times = _ensure_realistic_times()
    return [
        Task(
            id=t["id"],
            type="planned",
            task_type=t["task_type"],
            priority=t["priority"],
            location_lat=t["lat"],
            location_lng=t["lng"],
            address=t["address"],
            scheduled_time=times.get(t["id"], t["time"]),
            duration_mins=t["duration"],
            consent_required=t["consent"],
            status="assigned" if _TASK_OWNER.get(t["id"]) else "pending",
            required_skill=t["skill"],
            worker_id=_TASK_OWNER.get(t["id"]),
        )
        for t in TASKS
    ]


def _time_in_window(t: str, window: tuple[str, str]) -> bool:
    lo, hi = window
    return lo <= t <= hi


def validate_tasks(tasks: list[Task]) -> None:
    """Seed-level guardrails: scheduling window + type→default invariants."""
    errors: list[str] = []
    for t in tasks:
        rule = TYPE_RULES.get(t.task_type)
        if rule is None:
            errors.append(f"{t.id}: unknown task_type {t.task_type!r}")
            continue
        if not _time_in_window(t.scheduled_time, rule["window"]):
            errors.append(
                f"{t.id}: scheduled_time {t.scheduled_time} outside "
                f"{t.task_type} window {rule['window']}"
            )
        if t.priority != rule["priority"]:
            errors.append(f"{t.id}: priority {t.priority} != rule {rule['priority']}")
        if t.duration_mins != rule["duration"]:
            errors.append(f"{t.id}: duration {t.duration_mins} != rule {rule['duration']}")
        if t.consent_required != rule["consent"]:
            errors.append(f"{t.id}: consent_required {t.consent_required} != rule {rule['consent']}")
    if errors:
        raise ValueError("Seed validation failed:\n  " + "\n  ".join(errors))


def _compass(dlat: float, dlng: float) -> str:
    ns = "N" if dlat >= 0 else "S"
    ew = "E" if dlng >= 0 else "W"
    return f"{ns}{ew}"


def preview(workers: list[Worker], tasks: list[Task], first_n_tasks: int) -> None:
    print(f"\nWorkers ({len(workers)}):\n")
    header = f"  {'id':<4} {'name':<14} {'zone':<18} {'lat':>8} {'lng':>8}  {'skills':<26} shift"
    print(header)
    print("  " + "-" * (len(header) - 2))
    for w, meta in zip(workers, WORKERS):
        skills = ", ".join(w.skill_tags)
        print(f"  {w.id:<4} {w.name:<14} {meta['zone']:<18} "
              f"{w.current_lat:>8.4f} {w.current_lng:>8.4f}  "
              f"{skills:<26} {w.shift_end_time}")

    n = min(first_n_tasks, len(tasks))
    print(f"\nTasks ({n} of {len(tasks)}):\n")
    header = (f"  {'#':>2}  {'task_type':<17} {'address':<48} "
              f"{'time':<5} {'pri':>3} {'cns':>3} {'dur':>4}")
    print(header)
    print("  " + "-" * (len(header) - 2))
    for i, t in enumerate(tasks[:n], 1):
        addr = t.address if len(t.address) <= 47 else t.address[:46] + "…"
        cns = "yes" if t.consent_required else "no"
        print(f"  {i:>2}  {t.task_type:<17} {addr:<48} "
              f"{t.scheduled_time:<5} {t.priority:>3} {cns:>3} {t.duration_mins:>4}")

    # Per-type count sanity
    from collections import Counter
    tally = Counter(t.task_type for t in tasks)
    print("\n  breakdown:", ", ".join(f"{k}={v}" for k, v in sorted(tally.items())))

    # S6 positioning cross-check (straight-line only).
    print(f"\nS6 check (anchor = {S6_ANCHOR_LAT}, {S6_ANCHOR_LNG}):")
    for wid in ("W5", "W6"):
        w = next(w for w in workers if w.id == wid)
        d = _haversine_km(w.current_lat, w.current_lng, S6_ANCHOR_LAT, S6_ANCHOR_LNG)
        bearing = _compass(w.current_lat - S6_ANCHOR_LAT, w.current_lng - S6_ANCHOR_LNG)
        meta = next(m for m in WORKERS if m["id"] == wid)
        print(f"  {wid} ({meta['zone']:<12}): {d:.2f} km straight-line, bearing {bearing}")
    print("  (straight-line only; verify road ETA with Distance Matrix during demo prep)\n")


def apply(workers: list[Worker], tasks: list[Task], db_path: Path) -> None:
    if not SCHEMA_PATH.exists():
        sys.exit(f"Schema file not found: {SCHEMA_PATH}")

    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        con.executescript(SCHEMA_PATH.read_text())

        for tbl in ("events", "consent_requests", "routes", "tasks", "workers"):
            con.execute(f"DELETE FROM {tbl}")

        con.executemany(
            "INSERT INTO workers "
            "(id, name, current_lat, current_lng, status, skill_tags, "
            " shift_end_time, assigned_task_ids) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    w.id, w.name, w.current_lat, w.current_lng, w.status,
                    json.dumps(w.skill_tags), w.shift_end_time,
                    json.dumps(w.assigned_task_ids),
                )
                for w in workers
            ],
        )

        con.executemany(
            "INSERT INTO tasks "
            "(id, type, task_type, priority, location_lat, location_lng, "
            " address, scheduled_time, duration_mins, consent_required, "
            " status, required_skill, worker_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    t.id, t.type, t.task_type, t.priority,
                    t.location_lat, t.location_lng, t.address,
                    t.scheduled_time, t.duration_mins,
                    int(t.consent_required), t.status, t.required_skill,
                    t.worker_id,
                )
                for t in tasks
            ],
        )

        con.commit()
    finally:
        con.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--apply", action="store_true",
                        help="write to the database (default is preview only)")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH,
                        help=f"SQLite database path (default: {DEFAULT_DB_PATH})")
    parser.add_argument("--first-tasks", type=int, default=25,
                        help="how many tasks to show in preview (default: 25)")
    args = parser.parse_args(argv)

    workers = build_workers()
    tasks = build_tasks()
    validate_tasks(tasks)
    preview(workers, tasks, first_n_tasks=args.first_tasks)

    if not args.apply:
        print("Dry run — no changes written. Re-run with --apply to commit.")
        return 0

    apply(workers, tasks, args.db)
    print(f"Wrote {len(workers)} workers and {len(tasks)} tasks to {args.db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
