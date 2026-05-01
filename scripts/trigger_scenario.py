"""CLI — fire a pre-configured ad-hoc scenario at the running demo.

Usage:
    python3.11 -m scripts.trigger_scenario --list                 # show all payloads
    python3.11 -m scripts.trigger_scenario --scenario 1           # print payload JSON
    python3.11 -m scripts.trigger_scenario --scenario 6 --alpha 0.0
    python3.11 -m scripts.trigger_scenario --scenario 2 --send    # POST to API

Payloads are canonical here. The API's /scenario/{n} endpoint (to be
built) will import SCENARIOS from this module so there is one source of
truth for the demo.

All ad-hoc triggers are fiber_cut except S4 (fault_repair).
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:  # allow `python3.11 scripts/trigger_scenario.py`
    sys.path.insert(0, str(REPO_ROOT))

from core.models import Task  # noqa: E402


@dataclass(frozen=True)
class Scenario:
    number: int
    name: str
    expect: str
    payload: dict

    def task(self) -> Task:
        return Task(**self.payload)


def _now_hm() -> str:
    """Wall-clock HH:MM at the moment the scenario is triggered. Used as
    the scheduled_time for ad-hoc tasks so the WFM payload + planner see
    a 'dispatch now' anchor instead of the legacy hardcoded 12:00 — that
    constant made the dashboard show every fiber cut at noon and pushed
    it past the planner's late-window check. The route_planner gates
    ad-hoc placement on `task.type` + `priority`, NOT on scheduled_time,
    so this value is purely a label."""
    from datetime import datetime
    now = datetime.now()
    return f"{now.hour:02d}:{now.minute:02d}"


def _payload(
    *,
    sid: str,
    task_type: str,
    address: str,
    lat: float,
    lng: float,
    priority: int,
    duration: int,
    consent: bool,
    skill: str,
) -> dict:
    # `scheduled_time` is an at-trigger placeholder; the API endpoint
    # overrides it with the current wall-clock HH:MM via _now_hm() right
    # before publishing TASK_CREATED. The route_planner gates ad-hoc
    # placement on task.type + priority, not on scheduled_time, so this
    # value is purely a label in the WFM/event log.
    return dict(
        id=sid,
        type="adhoc",
        task_type=task_type,
        priority=priority,
        location_lat=lat,
        location_lng=lng,
        address=address,
        scheduled_time="00:00",
        duration_mins=duration,
        consent_required=consent,
        status="pending",
        required_skill=skill,
        worker_id=None,
    )


SCENARIOS: dict[int, Scenario] = {
    1: Scenario(
        number=1, name="Fiber Cut · Critical Priority",
        expect=(
            "Clean reallocation — nearest fiber_cut-skilled technician "
            "absorbs it. No consent needed."
        ),
        payload=_payload(
            sid="AD-S1", task_type="fiber_cut",
            address="Sector 29 Fiber Cut — Junction Box 4B",
            lat=28.4595, lng=77.0266,
            priority=5, duration=60, consent=False, skill="fiber_cut",
        ),
    ),
    2: Scenario(
        number=2, name="Fiber Cut · Consent Required",
        expect=(
            "Best worker has a scheduled job needing customer consent to "
            "move. Presenter replies in any language on the demo phone."
        ),
        payload=_payload(
            sid="AD-S2", task_type="fiber_cut",
            # Coords sit on top of W1 (Aarav, Cyber City home) so W1 is
            # the unambiguous winner — score gap to rank 2 exceeds the
            # SMART_ASSIGNMENT 0.05 threshold, so the system commits to
            # rank 1 even though his existing NI queue requires consent.
            # That's the whole point of S2: make the Telegram round-trip
            # fire reliably for the live demo moment.
            address="DLF Phase 3 Fiber Cut — Cabinet C7",
            lat=28.4955, lng=77.0890,
            priority=5, duration=60, consent=False, skill="fiber_cut",
        ),
    ),
    3: Scenario(
        number=3, name="New Installation · Medium Priority",
        expect=(
            "System evaluates the fleet and requests customer consent if a "
            "job needs to move. Presenter controls the Telegram reply."
        ),
        payload=_payload(
            sid="AD-S3", task_type="new_installation",
            address="Cyber City Tower B — Floor 12 New Fiber Installation",
            lat=28.4955, lng=77.0890,
            priority=3, duration=120, consent=True, skill="installation",
        ),
    ),
    4: Scenario(
        number=4, name="New Installation · Medium Priority",
        expect=(
            "Second installation while S3 is still in flight — fleet "
            "balancing is visible on the map."
        ),
        payload=_payload(
            sid="AD-S4", task_type="new_installation",
            address="Golf Course Road Tower A — Floor 8 New Installation",
            lat=28.4420, lng=77.1023,
            priority=3, duration=120, consent=True, skill="installation",
        ),
    ),
    5: Scenario(
        number=5, name="Fault Repair · Medium Priority",
        expect=(
            "All nearby fault-skilled technicians are at capacity. "
            "System escalates to dispatcher. (Run make seed-s5 first.)"
        ),
        payload=_payload(
            sid="AD-S5", task_type="fault_repair",
            address="MG Road Exchange — Node 14 Fault Repair",
            lat=28.4785, lng=77.0640,
            priority=3, duration=60, consent=True, skill="fault",
        ),
    ),
    6: Scenario(
        number=6, name="Fault Repair · Medium Priority",
        expect=(
            "W5 and W6 equidistant from the anchor — alpha slider flips "
            "which one wins."
        ),
        payload=_payload(
            sid="AD-S6", task_type="fault_repair",
            address="Sector 29 Exchange — Node 7 Fault Repair",
            lat=28.4595, lng=77.0266,
            priority=3, duration=60, consent=True, skill="fault",
        ),
    ),
}


def print_table() -> None:
    print("\nPre-configured scenario triggers:\n")
    header = (f"  {'S':<2} {'name':<24} {'task_type':<17} "
              f"{'address':<32} {'pri':>3} {'cns':>3} {'dur':>4}")
    print(header)
    print("  " + "-" * (len(header) - 2))
    for s in SCENARIOS.values():
        p = s.payload
        cns = "yes" if p["consent_required"] else "no"
        addr = p["address"] if len(p["address"]) <= 31 else p["address"][:30] + "…"
        print(f"  S{s.number:<1} {s.name:<24} {p['task_type']:<17} "
              f"{addr:<32} {p['priority']:>3} {cns:>3} {p['duration_mins']:>4}")
    print()
    print("  location details:")
    for s in SCENARIOS.values():
        p = s.payload
        print(f"    S{s.number}: ({p['location_lat']}, {p['location_lng']}) "
              f"skill={p['required_skill']}  — {s.expect}")
    print()


def send(scenario: Scenario, alpha: float | None, api_url: str) -> int:
    url = f"{api_url.rstrip('/')}/scenario/{scenario.number}"
    if alpha is not None:
        url += "?" + urllib.parse.urlencode({"alpha": alpha})
    print(f"POST {url}")
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  {resp.status} {resp.reason}\n  {body}")
            return 0
    except urllib.error.URLError as e:
        print(f"  send failed: {e}")
        print("  (API not running? Start with `make start` first.)")
        return 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--scenario", type=int, choices=sorted(SCENARIOS),
                        help="scenario number 1..6")
    parser.add_argument("--alpha", type=float,
                        help="route-planner weight 0.0 (distance) .. 1.0 (time)")
    parser.add_argument("--list", action="store_true",
                        help="print all 6 payloads as a table and exit")
    parser.add_argument("--send", action="store_true",
                        help="POST the trigger to the API (default is dry run)")
    parser.add_argument("--api-url", default="http://localhost:8000",
                        help="API base URL (default: http://localhost:8000)")
    args = parser.parse_args(argv)

    if args.list:
        print_table()
        return 0

    if args.scenario is None:
        parser.error("one of --list or --scenario N is required")

    scenario = SCENARIOS[args.scenario]
    # Validate the payload against the Task model before anything else.
    scenario.task()

    print(f"S{scenario.number} — {scenario.name}")
    print(f"  expect: {scenario.expect}\n")
    print(json.dumps(scenario.payload, indent=2))

    if args.alpha is not None:
        print(f"\n  alpha override: {args.alpha}")

    if args.send:
        print()
        return send(scenario, args.alpha, args.api_url)

    print("\nDry run — add --send to POST to the API.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
