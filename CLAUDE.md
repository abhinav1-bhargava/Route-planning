# Route Planning Agent Demo — Project Context

## What this is

A multi-agent route planning system for field workforce management. 10 field workers across Gurugram. 25 pre-planned tasks at day start. Ad-hoc high-priority tasks arrive mid-day and trigger autonomous reallocation, re-routing, and customer consent collection via Telegram.

Built as a live demo for business/product stakeholders. Every agent decision must be visible, traceable, and explainable in plain English on the dashboard.

---

## Tech stack

| Layer | Technology |
|---|---|
| Agent runtime | Python 3.11 · asyncio |
| LLM | Claude API — Sonnet 4.5 (Supervisor + Consent agents only) |
| API server | FastAPI |
| Event bus | asyncio queue (dev) · Redis Pub/Sub (prod) |
| Distance cache | Redis hash · TTL 300s |
| Database | SQLite (demo) |
| Dashboard | Next.js 14 · React · TypeScript · Tailwind |
| Map | Google Maps JS SDK |
| Google APIs | Distance Matrix · Directions · Geocoding |
| Polyline geometry | OSRM public API — dashboard visuals only (see Map rendering rules) |
| Consent channel | Telegram bot · python-telegram-bot · long-polling |
| Infrastructure | Docker Compose |

---

## Project structure

```
route-planning-demo/
├── agents/
│   ├── supervisor.py          # LLM — priority scoring, reallocation trigger, escalation
│   ├── route_planner.py       # Deterministic — nearest-neighbour + time-window optimisation
│   ├── reallocation.py        # Deterministic — worker scoring, consent check, lock
│   └── consent.py             # LLM — Telegram message composition, reply handling, timeout
├── core/
│   ├── event_bus.py           # asyncio queue or Redis Pub/Sub, toggled by ENV
│   ├── state_store.py         # SQLite read/write helpers
│   ├── distance_cache.py      # Redis cache + Google Distance Matrix batch fetcher
│   └── models.py              # Pydantic models for all entities
├── api/
│   ├── main.py                # FastAPI app, lifespan, startup
│   ├── websocket.py           # WS /ws/events — streams events to dashboard
│   └── routes.py              # REST: /tasks /workers /routes /events /reset /scenario/{n}
├── integrations/
│   ├── google_maps.py         # Google: get_distance_matrix · get_directions · geocode_address · OSRM: get_route_geometry
│   └── telegram_bot.py        # long-polling bot · reply handler · chat_id registry
├── data/
│   ├── schema.sql             # SQLite schema — 5 tables + indexes
│   ├── seed.py                # Base state — 10 workers + 25 tasks across Gurugram
│   └── seed_s5.py             # Scenario 5 state — all nearby workers fully loaded
├── dashboard/
│   ├── pages/
│   ├── components/
│   │   ├── Map.tsx            # Google Maps, worker markers, route polylines, task pins
│   │   ├── WorkerPanel.tsx    # 10 worker cards, status badges, ETA, task count
│   │   ├── EventLog.tsx       # Live WebSocket feed, agent pills, correlation grouping
│   │   └── MetricsStrip.tsx   # On-time %, fleet km, tasks at risk, replan count
│   └── hooks/
│       └── useWebSocket.ts    # Connects to WS /ws/events, feeds all components
├── scripts/
│   ├── reset_demo.py          # Truncate DB, reload seed, flush Redis
│   └── trigger_scenario.py    # CLI — --scenario 1-6 --alpha 0.0-1.0
├── docker-compose.yml
├── Makefile
├── requirements.txt
├── .env.example
└── CLAUDE.md                  # This file
```

---

## Data models

### Worker
```python
id: str
name: str
current_lat: float
current_lng: float
status: Literal["idle", "en_route", "on_site"]
skill_tags: list[str]          # electrical · plumbing · HVAC · network · security
shift_end_time: str            # HH:MM
assigned_task_ids: list[str]
```

### Task
```python
id: str
type: Literal["planned", "adhoc"]
priority: int                  # 1–5
location_lat: float
location_lng: float
address: str
scheduled_time: str            # HH:MM
duration_mins: int
consent_required: bool
status: Literal["pending", "assigned", "in_progress", "completed", "deferred"]
required_skill: str
worker_id: str | None
```

### Route
```python
id: str
worker_id: str
ordered_task_ids: list[str]
total_distance_km: float
total_time_mins: int
version: int                   # increments on every replan
created_at: datetime
```

### ConsentRequest
```python
id: str
task_id: str
customer_phone: str
message_text: str
sent_at: datetime
response: Literal["yes", "no", "timeout"] | None
resolved_at: datetime | None
timeout_mins: int = 10
```

### Event
```python
id: str                        # uuid
event_type: str
payload: dict
agent: str
correlation_id: str            # links all events in one reallocation chain
human_label: str               # plain-English sentence shown in dashboard
timestamp: datetime
```

---

## Event types

| Event | Producer | Consumer |
|---|---|---|
| `TASK_CREATED` | External / API | Supervisor |
| `REALLOCATION_TRIGGERED` | Supervisor | Reallocation agent |
| `ASSIGNMENT_PROPOSED` | Reallocation | Supervisor · Consent agent |
| `CONSENT_REQUIRED` | Supervisor | Consent agent |
| `CONSENT_RESOLVED` | Consent agent | Supervisor |
| `ROUTE_REPLAN` | Supervisor | Route planner · Worker state |
| `ROUTE_UPDATED` | Route planner | Dashboard · Worker state |
| `LOCATION_UPDATE` | Mock WFM / seed | Supervisor · Dashboard |
| `TASK_COMPLETED` | Mock WFM / seed | Supervisor · Route planner |
| `ESCALATION_REQUIRED` | Supervisor | Dashboard |

Every event carries `correlation_id`. One ad-hoc task trigger produces 6–8 events sharing the same `correlation_id`. Use this to group events visually in the event log.

---

## Agents

### Supervisor — LLM (Claude Sonnet 4.5)
- Subscribes to: `TASK_CREATED`, `CONSENT_RESOLVED`, `TASK_COMPLETED`
- On `TASK_CREATED`: scores priority using Claude with full fleet context. Priority >= 3 → emit `REALLOCATION_TRIGGERED`. Priority < 3 → append to best available worker queue.
- On `CONSENT_RESOLVED` outcome=yes → emit `ROUTE_REPLAN`. Outcome=no → re-run reallocation excluding refused worker. Outcome=timeout → emit `ESCALATION_REQUIRED`.
- On no viable reallocation: emit `ESCALATION_REQUIRED` with structured trade-off options.

### Route Planner — deterministic
- Subscribes to: `ROUTE_REPLAN`
- Runs nearest-neighbour ordering on assigned tasks, respecting time windows.
- Calls `get_distance_matrix` (checks cache first).
- Accepts `alpha` weight (0.0=distance-only, 1.0=time-only). Default 0.7.
- Emits `ROUTE_UPDATED` with ordered tasks, total km, total mins, per-stop ETAs.

### Reallocation — deterministic
- Subscribes to: `REALLOCATION_TRIGGERED`
- Scores each worker: `score = alpha * (1/eta_mins) + (1-alpha) * slack_mins + deferability_bonus`
- Acquires Redis lock `lock:reallocation:{worker_id}` (TTL 30s) before committing.
- If displaced task has `consent_required=True` → emit `CONSENT_REQUIRED`.
- If not → emit `ASSIGNMENT_PROPOSED` directly.

### Consent — LLM (Claude Sonnet 4.5)
- Subscribes to: `CONSENT_REQUIRED`
- Uses Claude to compose a natural-language Telegram message with old time, new time, and task description.
- Sends via Telegram bot. Sets 10-minute asyncio timeout.
- On YES/NO reply → emit `CONSENT_RESOLVED`.
- On timeout → emit `CONSENT_RESOLVED` with outcome=timeout.

---

## Six demo scenarios

All scenarios run from the same base seed state (except S5).

| # | Name | Priority | Consent | Distance | On-time | What it shows |
|---|---|---|---|---|---|---|
| S1 | Clean reallocation | High | Not required | Near | Preserved | Happy path — system just works |
| S2 | Consent YES | High | Required | Medium | Tight | Live Telegram moment — peak of demo |
| S3 | Consent NO | High | Required | Far | Preserved | Robustness — fallback worker found |
| S4 | Low priority queued | Low | Not required | Any | Within SLA | Restraint — no disruption, queued |
| S5 | No good option | High | Multiple | All far | At risk | Human-in-loop — escalation card |
| S6 | Optimise weight toggle | High | Not required | Tied | Equal ETA | Configurability — slider flips selection |

Demo play order: S1 → S2 → S3 → S4 → S5 → S6. No reset between S1 and S4.

S5 requires `make seed-s5` before triggering. S6 requires W5 and W6 pre-positioned at equal road distance from 28.4595, 77.0266.

---

## Geography

All workers and tasks are in Gurugram, Haryana. Worker starting zones:
Cyber City · Golf Course Road · Sohna Road · MG Road · Sector 14 · Sector 29 · Udyog Vihar · Palam Vihar · South City · Manesar

Use real Gurugram addresses in seed data. Run geocoding once during seed prep — do not call Geocoding API at runtime.

---

## Environment variables

```
ANTHROPIC_API_KEY=
GOOGLE_MAPS_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CUSTOMER_CHAT_ID=
REDIS_URL=redis://localhost:6379
DATABASE_URL=sqlite:///./demo.db
EVENT_BUS=asyncio          # asyncio | redis
ALPHA_DEFAULT=0.7
```

---

## Coding conventions

- All agent functions are async. Use `await` throughout — no blocking calls.
- All Redis operations wrapped in try/except with graceful degradation.
- Distance cache checked before every Google API call — never call Google directly without checking cache first.
- Every event emission includes `correlation_id` propagated from the triggering event.
- Every event includes a `human_label` — a plain-English sentence suitable for display in the dashboard event log. Write these as if narrating to a non-technical audience.
- No stubs. No placeholders. No `pass` in production paths. Every function fully implemented.
- Dashboard is TypeScript throughout. No `any` types.
- Tailwind only for styling — no inline styles, no CSS modules.
- Google Maps polyline redraws must animate — old route fades out over 1s, new route draws in.

---

## Map rendering rules

Strict three-way split between what the dashboard draws and what the agents decide on:

| Purpose | Service | Lives in |
|---|---|---|
| Dashboard polyline geometry (visual only) | OSRM public API | `integrations/google_maps.py` → `get_route_geometry` |
| ETA / distance for agent scoring (load-bearing) | Google Distance Matrix | `core/distance_cache.py` (cache-first) |
| Dashboard map renderer | Google Maps JS SDK | `dashboard/components/Map.tsx` |

Rules:

- `get_route_geometry(ordered_coords)` calls `https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson` with a **5s timeout**, returns GeoJSON LineString coords for the dashboard polyline. On error/timeout, fall back to straight-line segments between stops and log the fallback. The polyline is visual only — a fallback does **not** affect agent decisions.
- OSRM is **never** called from the reallocation scoring path, the route planner's time calculation, or anywhere ETA/distance feeds a decision. Those always go through Google Distance Matrix via the cache.
- The dashboard map stays on Google Maps JS SDK. **Do not** switch to Folium — Folium outputs static HTML and cannot redraw polylines live as reallocations happen.

---

## Make commands

```bash
make start      # docker compose up --build
make reset      # reload base seed state, flush Redis
make seed-s5    # load Scenario 5 state
make logs       # tail all service logs
make stop       # docker compose down
```

---

## WFM adapter (not built yet)

Worker state is currently mocked via the seed data and `state_store.py`. The WFM adapter is the last component — it replaces direct reads/writes to the worker state with calls to the real workforce management API. All agent logic is written against the `state_store` interface so the swap is transparent.

Do not build the WFM adapter now. Mock only.

---

## What is NOT in scope for the demo

- Real GPS updates from workers (mocked via seed positions)
- WFM adapter (mocked)
- Multi-city support
- Authentication on the dashboard
- Historical analytics beyond the current session
EOF