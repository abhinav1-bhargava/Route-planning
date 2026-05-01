"""FastAPI app — lifespan orchestration for the route planning demo.

Startup order:
    1. Load .env (python-dotenv, optional)
    2. Build singletons (bus, store, cache, bot)
    3. Start: bus → store → cache → bot
       Cache and bot wrap start() in try/except so a missing Redis or bad
       Telegram token logs-and-continues rather than hard-failing startup.
    4. Register agents downstream-first:
         route_planner → reallocation → consent → supervisor
    5. Register WebSocket broadcaster
    6. Initial plan kick — one ROUTE_REPLAN per worker with
       correlation_id = "startup-{worker_id}"

Shutdown reverses step 3 (bot → cache → store → bus).
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents import (
    anomaly, consent, debrief, reallocation, route_planner, supervisor,
)
from core.distance_cache import get_distance_cache
from core.event_bus import get_bus
from core.models import Event, EventType
from core.state_store import get_store
from integrations.telegram_bot import get_bot

# Route application logs through the root handler so uvicorn surfaces them.
# Without this, `logger.info(...)` calls in our modules are swallowed because
# uvicorn only configures its own `uvicorn` / `uvicorn.access` loggers.
_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=_LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. .env
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        logger.debug("python-dotenv not installed; skipping .env load")

    # 2. Singletons
    bus = get_bus()
    store = get_store()
    cache = get_distance_cache()
    bot = get_bot()

    # 3. Start in order; cache + bot log-and-continue on failure
    await bus.start()
    await store.start()

    try:
        await cache.start()
    except Exception:
        logger.exception(
            "distance_cache start failed; continuing without Redis. "
            "Distance calls will go directly to Google; lock acquisition "
            "will succeed optimistically (no mutual exclusion)."
        )

    logger.info("lifespan: about to start TelegramBot")
    try:
        await bot.start()
        logger.info("lifespan: TelegramBot started successfully")
    except Exception as exc:
        logger.exception(
            "Telegram bot start FAILED (%s); continuing without Telegram. "
            "Consent flows will resolve to outcome=timeout because the "
            "bot is unavailable. Full traceback above.", type(exc).__name__,
        )

    # 4. Register agents — downstream-first
    route_planner.register(bus)
    reallocation.register(bus)
    consent.register(bus)
    supervisor.register(bus)
    # New LLM agents (downstream listeners on existing event types).
    debrief.register(bus)
    anomaly.register(bus)

    # 5. WebSocket broadcaster — listens to every event type
    from api.websocket import register_broadcaster
    register_broadcaster(bus)

    # 6. Initial plan kick — one correlation_id per worker. Wait until every
    #    worker has emitted ROUTE_UPDATED (or a short timeout fires) so the
    #    first browser request to GET /routes sees real polylines, not empty
    #    placeholders.
    workers: list = []
    try:
        workers = await store.list_workers()
        ready = asyncio.Event()
        seen: set[str] = set()

        async def _count_startup_routes(event: Event) -> None:
            if event.event_type != EventType.ROUTE_UPDATED:
                return
            if not event.correlation_id.startswith("startup-"):
                return
            wid = event.payload.get("worker_id") if event.payload else None
            if wid:
                seen.add(str(wid))
                if len(seen) >= len(workers):
                    ready.set()

        bus.subscribe(EventType.ROUTE_UPDATED, _count_startup_routes)

        for w in workers:
            ev = Event(
                event_type=EventType.ROUTE_REPLAN,
                payload={"worker_id": w.id},
                agent="startup",
                correlation_id=f"startup-{w.id}",
                human_label=f"Initial route plan for {w.name}.",
            )
            await bus.publish(ev)
            await store.save_event(ev)

        try:
            await asyncio.wait_for(ready.wait(), timeout=20.0)
            logger.info(
                "Initial routes computed for all %d workers", len(workers),
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Startup routes timeout — %d/%d workers done after 20s",
                len(seen), len(workers),
            )
    except Exception:
        logger.exception(
            "initial plan kick failed; app startup continues. "
            "First real event will drive routing."
        )

    logger.info(
        "Application started: 6 agents registered, %d workers kicked",
        len(workers) if workers else 0,
    )

    yield

    # Shutdown — reverse order
    for name, stopper in (
        ("telegram bot", bot.stop),
        ("distance cache", cache.stop),
        ("state store", store.stop),
        ("event bus", bus.stop),
    ):
        try:
            await stopper()
        except Exception:
            logger.exception("%s stop error", name)

    logger.info("Application stopped cleanly.")


app = FastAPI(title="Route Planning Agent Demo", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # dev-only — lock down for production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers are imported AFTER the app is constructed so the module graph
# is: main → {routes, websocket} → {agents, core}, no cycles.
from api.routes import router as rest_router          # noqa: E402
from api.websocket import router as ws_router          # noqa: E402

app.include_router(rest_router)
app.include_router(ws_router)
