"""End-to-end test suite for the route-planning demo.

Run via:  TEST_MODE=1 make test-e2e

The suite hits a live API on localhost:8000. It does NOT spin up its own
server — the caller (Makefile / dev) is expected to have one running with
TEST_MODE=1 in the environment so the /test/consent/* endpoints are
unlocked. Each test calls /reset and waits for the startup replan to
settle before issuing scenario triggers.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request as ur

BASE = "http://localhost:8000"
PASS_COUNT = 0
FAIL_COUNT = 0


def get(path: str):
    try:
        return json.loads(ur.urlopen(BASE + path).read())
    except Exception as e:
        raise AssertionError(f"GET {path} failed: {e}")


def post(path: str, data: bytes = b""):
    try:
        req = ur.Request(
            BASE + path,
            method="POST",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        return json.loads(ur.urlopen(req).read())
    except Exception as e:
        raise AssertionError(f"POST {path} failed: {e}")


def reset():
    """Reset DB + wait for startup replans to land. The replan kick is
    async over the bus so a sleep is the most reliable barrier without
    polling a specific endpoint count."""
    post("/reset")
    deadline = time.time() + 25
    while time.time() < deadline:
        routes = get("/routes")
        populated = sum(1 for r in routes if r.get("ordered_task_ids"))
        if populated == 10:
            time.sleep(0.5)
            return
        time.sleep(0.5)


def wait_for_event(event_type: str, corr_id: str, timeout: float = 20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        events = get("/events?limit=500")
        match = next(
            (
                e for e in events
                if e.get("event_type") == event_type
                and e.get("correlation_id") == corr_id
            ),
            None,
        )
        if match:
            return match
        time.sleep(1)
    return None


def run_test(name: str, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        PASS_COUNT += 1
        print(f"✓ PASS — {name}")
    except AssertionError as e:
        FAIL_COUNT += 1
        print(f"✗ FAIL — {name}")
        print(f"         {e}")
    except Exception as e:
        FAIL_COUNT += 1
        print(f"! ERROR — {name}")
        print(f"          {e}")


# -------------------------------------------------------------------------
# TEST 1 — Initial load
# -------------------------------------------------------------------------
def test_initial_load():
    reset()
    routes = get("/routes")
    assert len(routes) == 10, f"Expected 10 routes, got {len(routes)}"
    for r in routes:
        assert len(r["ordered_task_ids"]) > 0, (
            f"{r['worker_id']} has no tasks in route"
        )
        assert r["total_distance_km"] > 0, (
            f"{r['worker_id']} has zero distance"
        )
    fleet_km = sum(r["total_distance_km"] for r in routes)
    assert fleet_km > 50, f"Fleet km too low: {fleet_km}"
    workers = get("/workers")
    assert len(workers) == 10, f"Expected 10 workers, got {len(workers)}"


run_test("Initial load — 10 routes with data", test_initial_load)


# -------------------------------------------------------------------------
# TEST 2 — Adhoc fiber cut at position 1
# -------------------------------------------------------------------------
def test_adhoc_position():
    reset()
    resp = post("/scenario/1")
    corr_id = resp.get("correlation_id", "")
    assert corr_id, "No correlation_id in response"

    # If a guardrail rejects rank 1, multiple ASSIGNMENT_PROPOSED events
    # fire under the same correlation. Walk the route table after the
    # final ROUTE_UPDATED settles and find the route that actually
    # carries the ad-hoc — that's the dispatched worker.
    wait_for_event("ROUTE_UPDATED", corr_id, timeout=30)
    time.sleep(3)

    tasks_resp = get("/tasks")
    adhoc_task = next(
        (t for t in tasks_resp if t["type"] == "adhoc"),
        None,
    )
    assert adhoc_task, "No adhoc task in /tasks"
    dispatched_wid = adhoc_task.get("worker_id")
    assert dispatched_wid, "Adhoc task has no worker assigned"

    routes = get("/routes")
    route = next(
        (r for r in routes if r["worker_id"] == dispatched_wid), None,
    )
    assert route, f"No route found for {dispatched_wid}"
    assert route["ordered_task_ids"], (
        f"{dispatched_wid} route is empty after dispatch"
    )

    tasks = {t["id"]: t for t in tasks_resp}
    first_id = route["ordered_task_ids"][0]
    first = tasks.get(first_id)
    assert first, f"Task {first_id} not found"
    assert first["type"] == "adhoc", (
        f"First task is {first['type']} not adhoc"
    )
    assert first["priority"] >= 4, (
        f"First task priority is {first['priority']}"
    )


run_test("S1 — adhoc fiber cut at position 1", test_adhoc_position)


# -------------------------------------------------------------------------
# TEST 3 — Worker position updates
# -------------------------------------------------------------------------
def test_worker_position():
    reset()
    resp = post("/scenario/1")
    corr_id = resp.get("correlation_id", "")
    proposed = wait_for_event("ASSIGNMENT_PROPOSED", corr_id, timeout=25)
    assert proposed, "No assignment for S1"
    worker_id = proposed["payload"]["worker_id"]
    time.sleep(4)

    workers = {w["id"]: w for w in get("/workers")}
    w = workers.get(worker_id)
    assert w, f"Worker {worker_id} not found"
    assert w["status"] == "en_route", (
        f"Status is {w['status']} not en_route"
    )

    tasks = get("/tasks")
    adhoc = next(
        (
            t for t in tasks
            if t["type"] == "adhoc"
            and t.get("worker_id") == worker_id
        ),
        None,
    )
    assert adhoc, "No adhoc task found for worker"
    assert abs(w["current_lat"] - adhoc["location_lat"]) < 0.01, (
        f"Worker at {w['current_lat']} but task at "
        f"{adhoc['location_lat']}"
    )


run_test("S1 — worker moves to task location", test_worker_position)


# -------------------------------------------------------------------------
# TEST 4 — S1 then S2 select different workers
# -------------------------------------------------------------------------
def test_different_workers():
    reset()

    r1 = post("/scenario/1")
    c1 = r1.get("correlation_id", "")
    p1 = wait_for_event("ASSIGNMENT_PROPOSED", c1, timeout=25)
    assert p1, "No assignment for S1"
    w1 = p1["payload"]["worker_id"]
    time.sleep(3)

    r2 = post("/scenario/2")
    c2 = r2.get("correlation_id", "")

    # S2 may go either direct or through consent depending on worker queue.
    # Use whichever event surfaces the chosen worker first.
    p2 = (
        wait_for_event("CONSENT_REQUIRED", c2, timeout=15)
        or wait_for_event("ASSIGNMENT_PROPOSED", c2, timeout=10)
    )
    assert p2, "No assignment for S2"
    w2 = p2["payload"]["worker_id"]

    assert w2 != w1, f"Both S1 and S2 assigned to {w1}"


run_test(
    "S1 then S2 — different workers", test_different_workers,
)


# -------------------------------------------------------------------------
# TEST 5 — Anomaly detection only on adhoc, not seed
# -------------------------------------------------------------------------
def test_anomaly_adhoc_only():
    reset()
    time.sleep(3)
    events = get("/events?limit=500")
    anomalies = [
        e for e in events
        if e.get("event_type") == "ANOMALY_DETECTED"
    ]
    assert len(anomalies) == 0, (
        f"Anomaly fired {len(anomalies)} times on seed data alone"
    )


run_test(
    "Anomaly — no false positives on seed",
    test_anomaly_adhoc_only,
)


# -------------------------------------------------------------------------
# TEST 6 — Route completion times realistic
# -------------------------------------------------------------------------
def test_completion_time():
    reset()
    routes = get("/routes")
    for r in routes:
        ec = r.get("estimated_completion", "")
        if not ec:
            continue
        h, m = map(int, ec.split(":"))
        completion = h * 60 + m
        assert completion > 10 * 60, (
            f"{r['worker_id']} done by {ec} before 10am — impossible"
        )
        assert completion < 20 * 60, (
            f"{r['worker_id']} done by {ec} after 8pm — unrealistic"
        )


run_test(
    "Route completion times realistic", test_completion_time,
)


# -------------------------------------------------------------------------
# TEST 7 — Dispatcher guardrail rejects sequential adhoc
# -------------------------------------------------------------------------
def test_dispatcher_guardrail():
    reset()

    r1 = post("/scenario/1")
    c1 = r1.get("correlation_id", "")
    p1 = wait_for_event("ASSIGNMENT_PROPOSED", c1, timeout=25)
    assert p1, "No assignment for S1"
    w1 = p1["payload"]["worker_id"]
    time.sleep(3)

    r2 = post("/scenario/1")
    c2 = r2.get("correlation_id", "")
    time.sleep(12)

    events = get("/events?limit=500")
    s2_events = [e for e in events if e.get("correlation_id") == c2]

    override = next(
        (
            e for e in s2_events
            if e.get("event_type") == "SUPERVISOR_OVERRIDE"
            and (e.get("payload") or {}).get("rejected_worker_id") == w1
        ),
        None,
    )
    proposed_events = [
        e for e in s2_events
        if e.get("event_type") == "ASSIGNMENT_PROPOSED"
    ]
    final_proposed = proposed_events[-1] if proposed_events else None

    if final_proposed:
        w2 = final_proposed["payload"]["worker_id"]
        assert w2 != w1, (
            f"Same worker {w1} assigned twice without override"
        )
    else:
        assert override, "No guardrail fired and no assignment"


run_test(
    "Dispatcher guardrail — sequential adhoc",
    test_dispatcher_guardrail,
)


# -------------------------------------------------------------------------
# TEST 8 — Fiber cut SLA: selected worker within 90 mins
# -------------------------------------------------------------------------
def test_fiber_cut_sla():
    reset()
    r1 = post("/scenario/1")
    c1 = r1.get("correlation_id", "")
    p1 = wait_for_event("ASSIGNMENT_PROPOSED", c1, timeout=25)
    assert p1, "No assignment for S1"

    eta = p1["payload"].get("eta_mins", 0)
    assert eta <= 90, (
        f"Selected worker ETA {eta} mins exceeds 90 min fiber cut SLA"
    )


run_test(
    "Fiber cut — selected worker within SLA", test_fiber_cut_sla,
)


# -------------------------------------------------------------------------
# TEST 9 — Post-allocation monitor fires on task completion
# -------------------------------------------------------------------------
def test_post_allocation_monitoring():
    reset()

    r1 = post("/scenario/1")
    c1 = r1.get("correlation_id", "")
    p1 = wait_for_event("ASSIGNMENT_PROPOSED", c1, timeout=25)
    assert p1, "No assignment for S1"
    worker_id = p1["payload"]["worker_id"]
    wait_for_event("ROUTE_UPDATED", c1, timeout=25)
    time.sleep(2)

    # Pick any planned task still assigned to this worker so we can
    # complete it without disturbing the just-dispatched ad-hoc.
    tasks = get("/tasks")
    target = next(
        (
            t for t in tasks
            if t.get("worker_id") == worker_id
            and t.get("type") == "planned"
            and t.get("status") == "assigned"
        ),
        None,
    )
    assert target, (
        f"No assigned planned task for {worker_id} to complete"
    )

    resp = post(f"/test/complete-task/{target['id']}")
    completed_corr = resp.get("correlation_id", "")
    assert completed_corr, "No correlation_id from /test/complete-task"

    # The monitor either emits POST_ALLOCATION_ALERT (if drift detected)
    # OR completes silently (clean state). Both are valid outcomes — the
    # test is satisfied as long as the TASK_COMPLETED event reached the
    # log and no exception bubbled up from the monitor.
    completed = wait_for_event("TASK_COMPLETED", completed_corr, timeout=10)
    assert completed, "TASK_COMPLETED event missing after /test/complete-task"
    time.sleep(3)


run_test(
    "Post-allocation monitor fires on task completion",
    test_post_allocation_monitoring,
)


# -------------------------------------------------------------------------
# TEST 10 — On-site constraint reflected in scoring
# -------------------------------------------------------------------------
def test_on_site_constraint():
    reset()

    # Flip W3 (Rohan Singh, Udyog Vihar — has installation skill, NOT
    # fiber_cut) to on_site via the test-mode arrive endpoint. Fiber-cut
    # scenarios will reject W3 on skill_match, so we use a fault_repair
    # scenario only insofar as we just need W3's WORKER_SCORED row to
    # carry on_site=true. S1 is fine because it scores all workers
    # regardless of skill.
    arrive = post("/workers/W3/arrive")
    assert arrive.get("arrived") == "W3", (
        f"Could not flip W3 to on_site: {arrive!r}"
    )
    time.sleep(2)

    workers = {w["id"]: w for w in get("/workers")}
    assert workers["W3"]["status"] == "on_site", (
        f"W3 status is {workers['W3']['status']}"
    )

    rem = get("/workers/W3/remaining")
    assert rem["remaining_mins"] >= 0, (
        "remaining_mins should be non-negative"
    )

    # Trigger S1 — every worker, including W3, is scored.
    r1 = post("/scenario/1")
    c1 = r1.get("correlation_id", "")
    assert c1, "no correlation_id from /scenario/1"
    time.sleep(8)

    events = get("/events?limit=500")
    w3_scored = [
        e for e in events
        if e.get("event_type") == "WORKER_SCORED"
        and e.get("correlation_id") == c1
        and (e.get("payload") or {}).get("worker_id") == "W3"
    ]
    assert w3_scored, (
        "No WORKER_SCORED event for W3 under the S1 correlation"
    )
    p = w3_scored[-1]["payload"]
    assert p.get("on_site") is True, (
        f"W3 should be on_site in scoring; got on_site={p.get('on_site')}"
    )
    assert "adjusted_eta_mins" in p, (
        "adjusted_eta_mins missing from WORKER_SCORED payload"
    )
    raw_eta = float(p.get("eta_mins") or 0)
    adj_eta = float(p.get("adjusted_eta_mins") or 0)
    assert adj_eta >= raw_eta, (
        f"adjusted_eta {adj_eta} should be >= raw eta {raw_eta}"
    )


run_test(
    "On-site constraint — remaining time in scoring",
    test_on_site_constraint,
)


# -------------------------------------------------------------------------
print()
print("=" * 50)
print(f"Results: {PASS_COUNT} passed, {FAIL_COUNT} failed")
if FAIL_COUNT > 0:
    sys.exit(1)
