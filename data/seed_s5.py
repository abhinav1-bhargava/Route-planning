"""Scenario 5 seed state — base seed + pre-assigned fillers for W5-W8.

S5 ("No good option") fires an ad-hoc fiber cut at Cyber City and is meant
to escalate because the nearby workers have no slack. This script loads
the same 10 workers and 25 base tasks as `data.seed`, then inserts 20
additional filler tasks pre-assigned to W5, W6, W7, W8 (5 each) so those
four workers have effectively full schedules from 09:00 to 17:00.

The filler tasks are planned, not ad-hoc, and cover only new_installation
and fault_repair — Fiber Cut is ad-hoc-only and never seeded.

Usage:
    python3.11 -m data.seed_s5             # preview only
    python3.11 -m data.seed_s5 --apply     # write to demo.db
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

from core.models import Task, Worker
from data.seed import (
    DEFAULT_DB_PATH,
    SCHEMA_PATH,
    WORKERS,
    apply as apply_base,
    build_tasks,
    build_workers,
    validate_tasks,
)


# Workers that will be overloaded for S5 ("No good option"). The S5 ad-hoc
# fiber cut lands at Cyber City (28.4955, 77.0890) and must escalate
# because no nearby worker can absorb it.
#
# Selection rationale — S5 is a fault_repair at MG Road (28.4785, 77.0640),
# requiring skill "fault". The fault-skilled workers are W3, W4, W7, W10.
# W3 (Udyog Vihar, ~2.5 km), W4 (Palam Vihar, ~5.3 km), and W7 (Sector 14,
# ~3 km) are all within the 20 km pre-filter and would normally absorb the
# job. W10 (Manesar) is ~25 km away and gets rejected by the pre-filter
# regardless. So overloading W3, W4, W7 forces every viable fault-skilled
# candidate to fail on slack → the supervisor escalates.
OVERLOADED_WORKER_IDS: list[str] = ["W3", "W4", "W7"]

# Five filler tasks per overloaded worker. Each stays inside its task-type
# scheduling window (new_installation: 09:00-14:00 start, fault_repair:
# 09:00-16:00 start). Back-to-back start times mean no travel slack,
# which is exactly the intent for S5.
FILL_TEMPLATE: list[dict] = [
    # (scheduled_time, task_type, duration, priority, consent, label)
    dict(time="09:00", task_type="new_installation", duration=120, priority=3, consent=True,  label="Install A"),
    dict(time="11:00", task_type="new_installation", duration=120, priority=3, consent=True,  label="Install B"),
    dict(time="13:00", task_type="new_installation", duration=120, priority=3, consent=True,  label="Install C"),
    dict(time="15:00", task_type="fault_repair",     duration=60,  priority=3, consent=True,  label="Repair 1"),
    dict(time="16:00", task_type="fault_repair",     duration=60,  priority=3, consent=True,  label="Repair 2"),
]


def _skill_for_task_type(task_type: str) -> str:
    """task_type → required_skill mapping. Matches the post-rename taxonomy
    (new_installation→installation, fault_repair→fault, network_rehab→
    network_rehab, fiber_cut→fiber_cut)."""
    return {
        "new_installation": "installation",
        "fault_repair": "fault",
        "network_rehab": "network_rehab",
        "fiber_cut": "fiber_cut",
    }[task_type]


def _worker_zone(worker_id: str) -> str:
    return next(w["zone"] for w in WORKERS if w["id"] == worker_id)


def _worker_coords(worker_id: str) -> tuple[float, float]:
    m = next(w for w in WORKERS if w["id"] == worker_id)
    return m["lat"], m["lng"]


def build_fill_tasks() -> list[Task]:
    """Pre-assigned filler tasks for each overloaded worker. required_skill
    is derived from task_type so every filler matches the post-rename
    taxonomy contract (no more worker-primary-skill heuristic)."""
    out: list[Task] = []
    for wid in OVERLOADED_WORKER_IDS:
        lat, lng = _worker_coords(wid)
        zone = _worker_zone(wid)
        for i, row in enumerate(FILL_TEMPLATE, start=1):
            out.append(
                Task(
                    id=f"S5-{wid}-{i:02d}",
                    type="planned",
                    task_type=row["task_type"],
                    priority=row["priority"],
                    location_lat=lat,
                    location_lng=lng,
                    address=f"{zone} — {row['label']} ({wid})",
                    scheduled_time=row["time"],
                    duration_mins=row["duration"],
                    consent_required=row["consent"],
                    status="assigned",
                    required_skill=_skill_for_task_type(row["task_type"]),
                    worker_id=wid,
                )
            )
    return out


def preview_s5(
    workers: list[Worker],
    base_tasks: list[Task],
    fill_tasks: list[Task],
) -> None:
    print(f"\nWorkers ({len(workers)}): identical to data.seed preview.")
    print(f"Base planned tasks ({len(base_tasks)}): identical to data.seed preview.")

    print(f"\nS5 filler tasks ({len(fill_tasks)}) — pre-assigned:\n")
    header = (f"  {'id':<11} {'worker':<7} {'task_type':<17} "
              f"{'time':<5} {'dur':>4} {'pri':>3} {'cns':>3} skill")
    print(header)
    print("  " + "-" * (len(header) - 2))
    for t in fill_tasks:
        cns = "yes" if t.consent_required else "no"
        print(f"  {t.id:<11} {t.worker_id or '-':<7} {t.task_type:<17} "
              f"{t.scheduled_time:<5} {t.duration_mins:>4} {t.priority:>3} "
              f"{cns:>3} {t.required_skill}")

    # Per-worker load summary.
    print("\n  per-worker overload summary:")
    for wid in OVERLOADED_WORKER_IDS:
        mins = sum(t.duration_mins for t in fill_tasks if t.worker_id == wid)
        count = sum(1 for t in fill_tasks if t.worker_id == wid)
        print(f"    {wid} ({_worker_zone(wid):<12}): {count} tasks = {mins} min of work (09:00-17:00)")

    tally = Counter(t.task_type for t in fill_tasks)
    print("  breakdown:", ", ".join(f"{k}={v}" for k, v in sorted(tally.items())))

    # Sanity: absolutely no fiber_cut anywhere in the seed data.
    combined = base_tasks + fill_tasks
    fiber = [t.id for t in combined if t.task_type == "fiber_cut"]
    if fiber:
        print(f"\n  ⚠ fiber_cut tasks found in seed: {fiber}")
    else:
        print("\n  fiber_cut check: 0 tasks (correct — fiber_cut is ad-hoc only).")
    print()


def apply_s5(
    workers: list[Worker],
    base_tasks: list[Task],
    fill_tasks: list[Task],
    db_path: Path,
) -> None:
    # Reset DB + write base seed first.
    apply_base(workers, base_tasks, db_path)

    # Insert the pre-assigned filler tasks on top and patch assigned_task_ids.
    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA foreign_keys = ON")

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
                for t in fill_tasks
            ],
        )

        for wid in OVERLOADED_WORKER_IDS:
            ids = [t.id for t in fill_tasks if t.worker_id == wid]
            con.execute(
                "UPDATE workers SET assigned_task_ids = ? WHERE id = ?",
                (json.dumps(ids), wid),
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
    args = parser.parse_args(argv)

    workers = build_workers()
    base_tasks = build_tasks()
    validate_tasks(base_tasks)
    fill_tasks = build_fill_tasks()

    preview_s5(workers, base_tasks, fill_tasks)

    if not args.apply:
        print("Dry run — no changes written. Re-run with --apply to commit.")
        return 0

    apply_s5(workers, base_tasks, fill_tasks, args.db)
    print(f"Wrote S5 state to {args.db}: "
          f"{len(workers)} workers, {len(base_tasks)} base tasks, "
          f"{len(fill_tasks)} filler tasks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
