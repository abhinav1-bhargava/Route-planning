"""SQLite read/write helpers. All methods are async; aiosqlite under the hood.

Usage:
    store = StateStore(db_path="./demo.db")
    await store.start()
    worker = await store.get_worker("W1")
    ...
    await store.stop()

All reads return Pydantic models from core.models. List and dict fields
round-trip through JSON TEXT columns; datetimes are stored as ISO-8601
UTC strings. FK enforcement is re-enabled on every connection (sqlite
does not persist PRAGMA foreign_keys across connections).

The store does not emit events on write. Callers that want a write to
produce an event must publish via event_bus separately — `save_event`
only persists, it does not transport.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from core.models import (
    ConsentRequest,
    ConsentResponse,
    Event,
    Route,
    Task,
    TaskStatus,
    Worker,
    WorkerStatus,
)

logger = logging.getLogger(__name__)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _worker_from_row(row: aiosqlite.Row) -> Worker:
    return Worker(
        id=row["id"],
        name=row["name"],
        current_lat=row["current_lat"],
        current_lng=row["current_lng"],
        status=row["status"],
        skill_tags=json.loads(row["skill_tags"]),
        shift_end_time=row["shift_end_time"],
        assigned_task_ids=json.loads(row["assigned_task_ids"]),
    )


def _task_from_row(row: aiosqlite.Row) -> Task:
    return Task(
        id=row["id"],
        type=row["type"],
        task_type=row["task_type"],
        priority=row["priority"],
        location_lat=row["location_lat"],
        location_lng=row["location_lng"],
        address=row["address"],
        scheduled_time=row["scheduled_time"],
        duration_mins=row["duration_mins"],
        consent_required=bool(row["consent_required"]),
        status=row["status"],
        required_skill=row["required_skill"],
        worker_id=row["worker_id"],
    )


def _route_from_row(row: aiosqlite.Row) -> Route:
    return Route(
        id=row["id"],
        worker_id=row["worker_id"],
        ordered_task_ids=json.loads(row["ordered_task_ids"]),
        total_distance_km=row["total_distance_km"],
        total_time_mins=row["total_time_mins"],
        version=row["version"],
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _consent_from_row(row: aiosqlite.Row) -> ConsentRequest:
    resolved = row["resolved_at"]
    return ConsentRequest(
        id=row["id"],
        task_id=row["task_id"],
        customer_phone=row["customer_phone"],
        message_text=row["message_text"],
        sent_at=datetime.fromisoformat(row["sent_at"]),
        response=row["response"],
        resolved_at=datetime.fromisoformat(resolved) if resolved else None,
        timeout_mins=row["timeout_mins"],
    )


def _event_from_row(row: aiosqlite.Row) -> Event:
    return Event(
        id=row["id"],
        event_type=row["event_type"],
        payload=json.loads(row["payload"]),
        agent=row["agent"],
        correlation_id=row["correlation_id"],
        human_label=row["human_label"],
        timestamp=datetime.fromisoformat(row["timestamp"]),
    )


class StateStore:
    """Single-connection SQLite store. Safe for concurrent async callers
    within one process; aiosqlite serialises all DB work on its own thread."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = str(db_path)
        self._conn: aiosqlite.Connection | None = None

    def _require_conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("StateStore not started — call start() first")
        return self._conn

    async def start(self) -> None:
        if self._conn is not None:
            return
        self._conn = await aiosqlite.connect(self._db_path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA foreign_keys = ON")
        await self._conn.commit()
        logger.debug("StateStore opened %s", self._db_path)

    async def stop(self) -> None:
        if self._conn is None:
            return
        try:
            await self._conn.commit()
        except Exception:
            logger.exception("error committing on stop")
        await self._conn.close()
        self._conn = None
        logger.debug("StateStore closed")

    # ---- workers ----------------------------------------------------------

    async def get_worker(self, worker_id: str) -> Worker | None:
        conn = self._require_conn()
        async with conn.execute(
            "SELECT * FROM workers WHERE id = ?", (worker_id,)
        ) as cur:
            row = await cur.fetchone()
        return _worker_from_row(row) if row else None

    async def list_workers(self) -> list[Worker]:
        conn = self._require_conn()
        async with conn.execute("SELECT * FROM workers ORDER BY id") as cur:
            rows = await cur.fetchall()
        return [_worker_from_row(r) for r in rows]

    async def upsert_worker(self, worker: Worker) -> None:
        conn = self._require_conn()
        await conn.execute(
            "INSERT OR REPLACE INTO workers "
            "(id, name, current_lat, current_lng, status, skill_tags, "
            " shift_end_time, assigned_task_ids) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                worker.id, worker.name, worker.current_lat, worker.current_lng,
                worker.status, json.dumps(worker.skill_tags),
                worker.shift_end_time, json.dumps(worker.assigned_task_ids),
            ),
        )
        await conn.commit()

    async def update_worker_location(
        self, worker_id: str, lat: float, lng: float
    ) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE workers SET current_lat = ?, current_lng = ? WHERE id = ?",
            (lat, lng, worker_id),
        )
        if cur.rowcount == 0:
            raise KeyError(worker_id)
        await conn.commit()

    async def update_worker_status(
        self, worker_id: str, status: WorkerStatus
    ) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE workers SET status = ? WHERE id = ?",
            (status, worker_id),
        )
        if cur.rowcount == 0:
            raise KeyError(worker_id)
        await conn.commit()

    async def get_worker_remaining_on_site(
        self, worker_id: str,
    ) -> int:
        """Minutes the worker still owes the customer they're currently
        with. 0 if the worker isn't on_site or no in-progress task is
        found. Computed as max(0, task.duration_mins − elapsed_since_arrival),
        where elapsed is derived from the most recent LOCATION_UPDATE
        event flipping this worker to on_site."""
        worker = await self.get_worker(worker_id)
        if worker is None or worker.status != "on_site":
            return 0

        in_progress = await self.list_tasks(
            worker_id=worker_id, status="in_progress",
        )
        if not in_progress:
            # Some flows mark the active task "assigned" until completion;
            # fall back to the next assigned task in that case.
            assigned = await self.list_tasks(
                worker_id=worker_id, status="assigned",
            )
            if not assigned:
                return 0
            current_task = assigned[0]
        else:
            current_task = in_progress[0]

        events = await self.list_events()
        arrival_event = None
        for e in reversed(events):
            if e.event_type != "LOCATION_UPDATE":
                continue
            ep = e.payload or {}
            if ep.get("worker_id") != worker_id:
                continue
            if ep.get("status") == "on_site":
                arrival_event = e
                break

        if arrival_event is None:
            return current_task.duration_mins

        ts = getattr(arrival_event, "timestamp", None)
        if ts is None:
            return current_task.duration_mins
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        elapsed_mins = int((now - ts).total_seconds() / 60)
        return max(0, current_task.duration_mins - elapsed_mins)

    async def set_worker_assigned_tasks(
        self, worker_id: str, task_ids: list[str]
    ) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE workers SET assigned_task_ids = ? WHERE id = ?",
            (json.dumps(task_ids), worker_id),
        )
        if cur.rowcount == 0:
            raise KeyError(worker_id)
        await conn.commit()

    # ---- tasks ------------------------------------------------------------

    async def get_task(self, task_id: str) -> Task | None:
        conn = self._require_conn()
        async with conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ) as cur:
            row = await cur.fetchone()
        return _task_from_row(row) if row else None

    async def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        worker_id: str | None = None,
    ) -> list[Task]:
        conn = self._require_conn()
        conditions: list[str] = []
        params: list = []
        if status is not None:
            conditions.append("status = ?")
            params.append(status)
        if worker_id is not None:
            conditions.append("worker_id = ?")
            params.append(worker_id)
        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        query = f"SELECT * FROM tasks{where} ORDER BY scheduled_time, id"
        async with conn.execute(query, params) as cur:
            rows = await cur.fetchall()
        return [_task_from_row(r) for r in rows]

    async def upsert_task(self, task: Task) -> None:
        conn = self._require_conn()
        await conn.execute(
            "INSERT OR REPLACE INTO tasks "
            "(id, type, task_type, priority, location_lat, location_lng, "
            " address, scheduled_time, duration_mins, consent_required, "
            " status, required_skill, worker_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                task.id, task.type, task.task_type, task.priority,
                task.location_lat, task.location_lng, task.address,
                task.scheduled_time, task.duration_mins,
                int(task.consent_required), task.status,
                task.required_skill, task.worker_id,
            ),
        )
        await conn.commit()

    async def assign_task(self, task_id: str, worker_id: str) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE tasks SET worker_id = ?, status = 'assigned' WHERE id = ?",
            (worker_id, task_id),
        )
        if cur.rowcount == 0:
            raise KeyError(task_id)
        await conn.commit()

    async def update_task_status(
        self, task_id: str, status: TaskStatus
    ) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE tasks SET status = ? WHERE id = ?",
            (status, task_id),
        )
        if cur.rowcount == 0:
            raise KeyError(task_id)
        await conn.commit()

    # ---- routes -----------------------------------------------------------

    async def save_route(self, route: Route) -> None:
        conn = self._require_conn()
        try:
            await conn.execute(
                "INSERT INTO routes "
                "(id, worker_id, ordered_task_ids, total_distance_km, "
                " total_time_mins, version, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    route.id, route.worker_id,
                    json.dumps(route.ordered_task_ids),
                    route.total_distance_km, route.total_time_mins,
                    route.version, _iso(route.created_at),
                ),
            )
            await conn.commit()
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"route insert failed: {exc}") from exc

    async def get_latest_route(self, worker_id: str) -> Route | None:
        conn = self._require_conn()
        async with conn.execute(
            "SELECT * FROM routes WHERE worker_id = ? "
            "ORDER BY version DESC LIMIT 1",
            (worker_id,),
        ) as cur:
            row = await cur.fetchone()
        return _route_from_row(row) if row else None

    async def next_route_version(self, worker_id: str) -> int:
        conn = self._require_conn()
        async with conn.execute(
            "SELECT MAX(version) FROM routes WHERE worker_id = ?",
            (worker_id,),
        ) as cur:
            row = await cur.fetchone()
        current = row[0] if row is not None else None
        return (current or 0) + 1

    # ---- consent ----------------------------------------------------------

    async def save_consent_request(self, req: ConsentRequest) -> None:
        conn = self._require_conn()
        try:
            await conn.execute(
                "INSERT INTO consent_requests "
                "(id, task_id, customer_phone, message_text, sent_at, "
                " response, resolved_at, timeout_mins) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    req.id, req.task_id, req.customer_phone, req.message_text,
                    _iso(req.sent_at), req.response,
                    _iso(req.resolved_at) if req.resolved_at else None,
                    req.timeout_mins,
                ),
            )
            await conn.commit()
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"consent request insert failed: {exc}") from exc

    async def get_consent_request(self, req_id: str) -> ConsentRequest | None:
        conn = self._require_conn()
        async with conn.execute(
            "SELECT * FROM consent_requests WHERE id = ?", (req_id,)
        ) as cur:
            row = await cur.fetchone()
        return _consent_from_row(row) if row else None

    async def update_consent_response(
        self, req_id: str, response: ConsentResponse
    ) -> None:
        conn = self._require_conn()
        cur = await conn.execute(
            "UPDATE consent_requests "
            "SET response = ?, resolved_at = ? WHERE id = ?",
            (response, _utcnow_iso(), req_id),
        )
        if cur.rowcount == 0:
            raise KeyError(req_id)
        await conn.commit()

    # ---- events -----------------------------------------------------------

    async def save_event(self, event: Event) -> None:
        conn = self._require_conn()
        try:
            await conn.execute(
                "INSERT INTO events "
                "(id, event_type, payload, agent, correlation_id, "
                " human_label, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    event.id, event.event_type, json.dumps(event.payload),
                    event.agent, event.correlation_id, event.human_label,
                    _iso(event.timestamp),
                ),
            )
            await conn.commit()
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"event insert failed: {exc}") from exc

    async def list_events(
        self,
        *,
        correlation_id: str | None = None,
        since: datetime | None = None,
        limit: int | None = None,
    ) -> list[Event]:
        conn = self._require_conn()
        conditions: list[str] = []
        params: list = []
        if correlation_id is not None:
            conditions.append("correlation_id = ?")
            params.append(correlation_id)
        if since is not None:
            conditions.append("timestamp >= ?")
            params.append(_iso(since))
        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        query = f"SELECT * FROM events{where} ORDER BY timestamp ASC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(int(limit))
        async with conn.execute(query, params) as cur:
            rows = await cur.fetchall()
        return [_event_from_row(r) for r in rows]

    # ---- admin ------------------------------------------------------------

    async def reset(self) -> None:
        conn = self._require_conn()
        for tbl in ("events", "consent_requests", "routes", "tasks", "workers"):
            await conn.execute(f"DELETE FROM {tbl}")
        await conn.commit()


_store: StateStore | None = None


def get_store(db_path: str | Path | None = None) -> StateStore:
    """Return the module-level store singleton. If unset, builds one from
    db_path (or DATABASE_URL env) on first call."""
    global _store
    if _store is None:
        if db_path is None:
            url = os.getenv("DATABASE_URL", "sqlite:///./demo.db")
            db_path = url.replace("sqlite:///", "", 1) if url.startswith("sqlite:///") else url
        _store = StateStore(db_path)
    return _store
