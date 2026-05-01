-- Route Planning Agent Demo — SQLite schema
-- 5 tables: workers, tasks, routes, consent_requests, events
--
-- List-valued columns (skill_tags, assigned_task_ids, ordered_task_ids) and
-- dict-valued columns (payload) are stored as JSON text. Datetimes are stored
-- as ISO-8601 strings (UTC). Booleans are stored as INTEGER 0/1.

-- NOTE: `foreign_keys` is a PER-CONNECTION pragma in SQLite. Setting it here
-- only enables it for the connection that runs this script. `state_store.py`
-- MUST re-issue `PRAGMA foreign_keys = ON` on every connection it opens,
-- otherwise the FK constraints below are silently not enforced.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- workers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
    id                 TEXT    PRIMARY KEY,
    name               TEXT    NOT NULL,
    current_lat        REAL    NOT NULL,
    current_lng        REAL    NOT NULL,
    status             TEXT    NOT NULL
                               CHECK (status IN ('idle', 'en_route', 'on_site')),
    skill_tags         TEXT    NOT NULL DEFAULT '[]',   -- JSON array[str]
    shift_end_time     TEXT    NOT NULL,                -- HH:MM
    assigned_task_ids  TEXT    NOT NULL DEFAULT '[]'    -- JSON array[str]
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id                 TEXT    PRIMARY KEY,
    type               TEXT    NOT NULL
                               CHECK (type IN ('planned', 'adhoc')),
    task_type          TEXT    NOT NULL
                               CHECK (task_type IN ('new_installation',
                                                    'fault_repair',
                                                    'network_rehab',
                                                    'fiber_cut')),
    priority           INTEGER NOT NULL
                               CHECK (priority BETWEEN 1 AND 5),
    location_lat       REAL    NOT NULL,
    location_lng       REAL    NOT NULL,
    address            TEXT    NOT NULL,
    scheduled_time     TEXT    NOT NULL,                -- HH:MM
    duration_mins      INTEGER NOT NULL CHECK (duration_mins > 0),
    consent_required   INTEGER NOT NULL DEFAULT 0
                               CHECK (consent_required IN (0, 1)),
    status             TEXT    NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'assigned',
                                                 'in_progress', 'completed',
                                                 'deferred')),
    required_skill     TEXT    NOT NULL,
    worker_id          TEXT    REFERENCES workers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority  ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);

-- ---------------------------------------------------------------------------
-- routes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
    id                 TEXT    PRIMARY KEY,
    worker_id          TEXT    NOT NULL
                               REFERENCES workers(id) ON DELETE CASCADE,
    ordered_task_ids   TEXT    NOT NULL DEFAULT '[]',   -- JSON array[str]
    total_distance_km  REAL    NOT NULL DEFAULT 0.0 CHECK (total_distance_km >= 0),
    total_time_mins    INTEGER NOT NULL DEFAULT 0   CHECK (total_time_mins   >= 0),
    version            INTEGER NOT NULL DEFAULT 1   CHECK (version >= 1),
    created_at         TEXT    NOT NULL,                -- ISO-8601 UTC
    UNIQUE (worker_id, version)
);

CREATE INDEX IF NOT EXISTS idx_routes_worker_id       ON routes(worker_id);
CREATE INDEX IF NOT EXISTS idx_routes_worker_version  ON routes(worker_id, version DESC);

-- ---------------------------------------------------------------------------
-- consent_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_requests (
    id                 TEXT    PRIMARY KEY,
    task_id            TEXT    NOT NULL
                               REFERENCES tasks(id) ON DELETE CASCADE,
    customer_phone     TEXT    NOT NULL,
    message_text       TEXT    NOT NULL,
    sent_at            TEXT    NOT NULL,                -- ISO-8601 UTC
    response           TEXT
                               CHECK (response IS NULL
                                      OR response IN ('yes', 'no', 'timeout')),
    resolved_at        TEXT,                            -- ISO-8601 UTC, nullable
    timeout_mins       INTEGER NOT NULL DEFAULT 10 CHECK (timeout_mins > 0)
);

CREATE INDEX IF NOT EXISTS idx_consent_task_id  ON consent_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_consent_response ON consent_requests(response);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id                 TEXT    PRIMARY KEY,             -- uuid
    event_type         TEXT    NOT NULL,
    payload            TEXT    NOT NULL DEFAULT '{}',   -- JSON object
    agent              TEXT    NOT NULL,
    correlation_id     TEXT    NOT NULL,
    human_label        TEXT    NOT NULL,
    timestamp          TEXT    NOT NULL                 -- ISO-8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp   ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type        ON events(event_type);
